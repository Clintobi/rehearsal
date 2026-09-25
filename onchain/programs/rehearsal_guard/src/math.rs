use anchor_lang::prelude::*;

use crate::errors::GuardError;

const E9: u128 = 1_000_000_000;

/// Displayed token amount with 9 decimals: raw x multiplier / 10^decimals.
pub fn ui_e9(raw: u64, decimals: u8, multiplier_e9: u64) -> Result<u128> {
    (raw as u128)
        .checked_mul(multiplier_e9 as u128)
        .map(|v| v / 10u128.pow(decimals as u32))
        .ok_or(GuardError::Overflow.into())
}

/// USD value (6 decimals) of a displayed amount at a USD price (6 decimals).
pub fn value_e6(ui_e9: u128, price_e6: u64) -> Result<u128> {
    ui_e9
        .checked_mul(price_e6 as u128)
        .map(|v| v / E9)
        .ok_or(GuardError::Overflow.into())
}

/// USD value (6 decimals) of a raw stablecoin amount.
pub fn stable_e6(raw: u64, decimals: u8) -> u128 {
    let d = decimals as i32 - 6;
    if d >= 0 {
        raw as u128 / 10u128.pow(d as u32)
    } else {
        raw as u128 * 10u128.pow((-d) as u32)
    }
}

/// USD per displayed token, 6 decimals.
pub fn price_e6(usd_e6: u128, ui_e9: u128) -> Result<u64> {
    require!(ui_e9 > 0, GuardError::NothingReceived);
    let p = usd_e6.checked_mul(E9).ok_or(GuardError::Overflow)? / ui_e9;
    u64::try_from(p).map_err(|_| GuardError::Overflow.into())
}

/// How much worse than fair the trade was, in bps. `given` is what the user handed over
/// and `fair_received` what they got, both in USD e6. Positive = worse than fair.
pub fn gap_bps(given_e6: u128, fair_received_e6: u128) -> Result<i32> {
    require!(fair_received_e6 > 0, GuardError::NothingReceived);
    let g = given_e6 as i128;
    let r = fair_received_e6 as i128;
    let bps = (g - r).checked_mul(10_000).ok_or(GuardError::Overflow)? / r;
    Ok(bps.clamp(i32::MIN as i128, i32::MAX as i128) as i32)
}

/// Opening-cross quantities at one price. Returns (stock_raw, stable_raw, usd_e6): how much
/// stock moves from the seller and how much stablecoin moves from the buyer, rounded down so
/// neither escrow is ever overdrawn.
pub fn cross_quantities(
    buy_stable_raw: u64, stable_decimals: u8, sell_stock_raw: u64, stock_decimals: u8, multiplier_e9: u64, price_e6: u64,
) -> Result<(u64, u64, u128)> {
    require!(price_e6 > 0 && multiplier_e9 > 0, GuardError::BadPrice);
    let buy_ui = stable_e6(buy_stable_raw, stable_decimals).checked_mul(E9).ok_or(GuardError::Overflow)? / price_e6 as u128;
    let sell_ui = ui_e9(sell_stock_raw, stock_decimals, multiplier_e9)?;
    let q_ui = buy_ui.min(sell_ui);
    let stock_raw = q_ui.checked_mul(10u128.pow(stock_decimals as u32)).ok_or(GuardError::Overflow)? / multiplier_e9 as u128;
    let usd_e6 = q_ui * price_e6 as u128 / E9;
    let stable_raw = if stable_decimals >= 6 { usd_e6 * 10u128.pow((stable_decimals - 6) as u32) } else { usd_e6 / 10u128.pow((6 - stable_decimals) as u32) };
    let stock_raw = u64::try_from(stock_raw.min(sell_stock_raw as u128)).map_err(|_| GuardError::Overflow)?;
    let stable_raw = u64::try_from(stable_raw.min(buy_stable_raw as u128)).map_err(|_| GuardError::Overflow)?;
    Ok((stock_raw, stable_raw, usd_e6))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scaled_amounts() {
        // 1.648 raw SPACEX (9 decimals) at a 5x split multiplier displays as 8.24
        assert_eq!(ui_e9(1_648_177_976, 9, 5_000_000_000).unwrap(), 8_240_889_880);
        // 2.24 NVDAx (8 decimals), multiplier 1.0017
        assert_eq!(ui_e9(224_009_283, 8, 1_001_701_196).unwrap(), 2_243_903_666);
    }

    #[test]
    fn value_and_price() {
        let ui = 2_000_000_000u128; // 2 tokens
        assert_eq!(value_e6(ui, 222_540_000).unwrap(), 445_080_000);
        assert_eq!(price_e6(500_000_000, ui).unwrap(), 250_000_000);
        assert_eq!(stable_e6(1_000_000, 6), 1_000_000);
    }

    #[test]
    fn cross_buyer_limited() {
        // $500 USDC buyer vs 10 NVDAx seller (8 decimals, mult 1.0017) at $222.54:
        // buyer takes ~2.2468 displayed tokens, seller keeps the rest.
        let (stock, stable, usd) = cross_quantities(500_000_000, 6, 1_000_000_000, 8, 1_001_700_000, 222_540_000).unwrap();
        assert!(stable <= 500_000_000 && stable >= 499_999_000, "stable {stable}");
        assert!(usd <= 500_000_000);
        // raw stock × multiplier ≈ 2.2468 displayed
        let shown = stock as u128 * 1_001_700_000 / 100_000_000;
        assert!((2_246_000_000..=2_247_000_000).contains(&(shown as u64)), "shown {shown}");
    }

    #[test]
    fn cross_seller_limited_with_split_multiplier() {
        // SPACEX: 0.2 raw (9 decimals) at a 5x multiplier = 1.0 displayed; buyer has $500 at $120.
        let (stock, stable, _) = cross_quantities(500_000_000, 6, 200_000_000, 9, 5_000_000_000, 120_000_000).unwrap();
        assert_eq!(stock, 200_000_000);
        assert_eq!(stable, 120_000_000); // exactly one displayed token at $120
    }

    #[test]
    fn gaps() {
        // paid $1000 for $990 of fair value -> 1.01% worse
        assert_eq!(gap_bps(1_000_000_000, 990_000_000).unwrap(), 101);
        // paid $990 for $1000 of fair value -> better than fair
        assert_eq!(gap_bps(990_000_000, 1_000_000_000).unwrap(), -100);
    }
}
