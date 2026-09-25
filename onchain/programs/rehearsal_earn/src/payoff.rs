//! Settlement math. Prices and strikes are USD per whole token (10^decimals raw units,
//! before the Scaled UI multiplier), 6 decimals. Stablecoins have 6 decimals, so a USD e6
//! amount is also a raw stablecoin amount. One contract is one raw unit of the stock.
//!
//! Buyers are paid rounded down and writers owe rounded up, so a vault can never pay out
//! more than it holds.

fn div_ceil(n: u128, d: u128) -> u128 {
    n.div_ceil(d)
}

fn unit(decimals: u8) -> u128 {
    10u128.pow(decimals as u32)
}

/// Stablecoin a put writer escrows for `contracts`.
pub fn put_collateral(contracts: u64, strike_e6: u64, decimals: u8) -> Option<u64> {
    let v = div_ceil((contracts as u128).checked_mul(strike_e6 as u128)?, unit(decimals));
    u64::try_from(v).ok()
}

/// Premium a buyer pays for `contracts` at `ask_e6` per whole token (rounded up, to the writer).
pub fn premium(contracts: u64, ask_e6: u64, decimals: u8) -> Option<u64> {
    let v = div_ceil((contracts as u128).checked_mul(ask_e6 as u128)?, unit(decimals));
    u64::try_from(v).ok()
}

/// Covered call, settled in the stock: contracts x (price - strike) / price.
/// `round_up` = the writer's side of the same payout.
pub fn call_payout(contracts: u64, strike_e6: u64, price_e6: u64, round_up: bool) -> Option<u64> {
    if price_e6 <= strike_e6 || contracts == 0 {
        return Some(0);
    }
    let n = (contracts as u128).checked_mul((price_e6 - strike_e6) as u128)?;
    let v = if round_up { div_ceil(n, price_e6 as u128) } else { n / price_e6 as u128 };
    u64::try_from(v.min(contracts as u128)).ok()
}

/// Cash-secured put, settled in the stablecoin: contracts x (strike - price) / 10^decimals.
pub fn put_payout(contracts: u64, strike_e6: u64, price_e6: u64, decimals: u8, round_up: bool) -> Option<u64> {
    if price_e6 >= strike_e6 || contracts == 0 {
        return Some(0);
    }
    let n = (contracts as u128).checked_mul((strike_e6 - price_e6) as u128)?;
    let v = if round_up { div_ceil(n, unit(decimals)) } else { n / unit(decimals) };
    u64::try_from(v).ok()
}

/// USD per whole token = share price x Scaled UI multiplier (9 decimals).
pub fn token_price_e6(share_price_e6: u64, multiplier_e9: u64) -> Option<u64> {
    let v = (share_price_e6 as u128).checked_mul(multiplier_e9 as u128)? / 1_000_000_000;
    u64::try_from(v).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    const D: u8 = 8; // xStocks decimals
    const ONE: u64 = 100_000_000; // one whole token

    #[test]
    fn put_collateral_is_strike_per_token() {
        // 2.5 tokens at a $180 strike = $450
        assert_eq!(put_collateral(ONE * 5 / 2, 180_000_000, D), Some(450_000_000));
        // rounds up by one micro-dollar on dust
        assert_eq!(put_collateral(1, 180_000_000, D), Some(2));
    }

    #[test]
    fn call_pays_the_gain_in_stock() {
        // 1 token, strike 180, close 200: buyer gets 20/200 = 0.1 token
        assert_eq!(call_payout(ONE, 180_000_000, 200_000_000, false), Some(ONE / 10));
        assert_eq!(call_payout(ONE, 180_000_000, 179_000_000, false), Some(0));
        assert_eq!(call_payout(ONE, 180_000_000, 180_000_000, false), Some(0));
    }

    #[test]
    fn put_pays_the_shortfall_in_stablecoin() {
        // 2 tokens, strike 180, close 171: 2 x $9 = $18
        assert_eq!(put_payout(2 * ONE, 180_000_000, 171_000_000, D, false), Some(18_000_000));
        assert_eq!(put_payout(2 * ONE, 180_000_000, 181_000_000, D, false), Some(0));
    }

    #[test]
    fn vault_never_pays_more_than_it_holds() {
        // Odd contract counts split across buyers: sum of rounded-down buyer payouts must
        // stay within the rounded-up writer liability.
        let (k, p) = (180_000_001u64, 199_999_997u64);
        let buyers = [3u64, 7, 11, 1_000_003, 42];
        let total: u64 = buyers.iter().sum();
        let paid: u64 = buyers.iter().map(|c| call_payout(*c, k, p, false).unwrap()).sum();
        assert!(paid <= call_payout(total, k, p, true).unwrap());
        let (k, p) = (180_000_001u64, 150_000_003u64);
        let paid: u64 = buyers.iter().map(|c| put_payout(*c, k, p, D, false).unwrap()).sum();
        assert!(paid <= put_payout(total, k, p, D, true).unwrap());
        assert!(put_payout(total, k, p, D, true).unwrap() <= put_collateral(total, k, D).unwrap());
    }

    #[test]
    fn premium_and_multiplier() {
        // 0.5 token at $1.25 premium per token = $0.625
        assert_eq!(premium(ONE / 2, 1_250_000, D), Some(625_000));
        // $200 share with a 1.02 dividend multiplier = $204 per token
        assert_eq!(token_price_e6(200_000_000, 1_020_000_000), Some(204_000_000));
    }
}
