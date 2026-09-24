use anchor_lang::prelude::*;
use anchor_spl::{token::ID as TOKEN_PROGRAM, token_2022::ID as TOKEN_2022_PROGRAM};

use crate::errors::GuardError;

/// Stablecoins valued at $1 per token.
pub const STABLES: [Pubkey; 4] = [
    pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), // USDC
    pubkey!("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"), // USDT
    pubkey!("2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo"), // PYUSD
    pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"), // USDC (devnet)
];

pub fn is_stable(mint: &Pubkey) -> bool {
    STABLES.contains(mint)
}

const TLV_START: usize = 166; // 165-byte base (padded) + 1-byte account type
const EXT_SCALED_UI_AMOUNT: u16 = 25;

/// Token-2022 Scaled UI Amount multiplier, 9 decimals (1.0 = 1_000_000_000).
/// A wallet shows raw_amount x multiplier; PreStocks use it for splits and xStocks
/// use it to pass dividends through, so ignoring it misprices by up to 5x.
pub fn ui_multiplier_e9(mint: &AccountInfo, now: i64) -> Result<u64> {
    const ONE: u64 = 1_000_000_000;
    if *mint.owner != TOKEN_2022_PROGRAM {
        return Ok(ONE);
    }
    let data = mint.try_borrow_data()?;
    if data.len() <= TLV_START {
        return Ok(ONE);
    }
    let mut o = TLV_START;
    while o + 4 <= data.len() {
        let ty = u16::from_le_bytes([data[o], data[o + 1]]);
        let len = u16::from_le_bytes([data[o + 2], data[o + 3]]) as usize;
        let body = o + 4;
        if ty == 0 && len == 0 {
            break;
        }
        require!(body + len <= data.len(), GuardError::BadMintData);
        if ty == EXT_SCALED_UI_AMOUNT {
            // authority(32) multiplier(f64) new_multiplier_effective_timestamp(i64) new_multiplier(f64)
            require!(len >= 56, GuardError::BadMintData);
            let m = f64::from_le_bytes(data[body + 32..body + 40].try_into().unwrap());
            let ts = i64::from_le_bytes(data[body + 40..body + 48].try_into().unwrap());
            let nm = f64::from_le_bytes(data[body + 48..body + 56].try_into().unwrap());
            let active = if ts != 0 && now >= ts { nm } else { m };
            require!(active.is_finite() && active > 0.0, GuardError::BadMintData);
            return Ok((active * ONE as f64) as u64);
        }
        o = body + len;
    }
    Ok(ONE)
}

/// Balance of a token account that may not exist yet (Jupiter creates the output ATA
/// inside the swap). An uninitialized account counts as zero; an initialized one must
/// belong to `owner` and hold `mint`.
pub fn balance_or_zero(acc: &AccountInfo, owner: &Pubkey, mint: &Pubkey) -> Result<u64> {
    if acc.data_is_empty() {
        return Ok(0);
    }
    require!(
        *acc.owner == TOKEN_PROGRAM || *acc.owner == TOKEN_2022_PROGRAM,
        GuardError::WrongTokenAccount
    );
    let data = acc.try_borrow_data()?;
    require!(data.len() >= 72, GuardError::WrongTokenAccount);
    require!(&data[0..32] == mint.as_ref(), GuardError::WrongTokenAccount);
    require!(&data[32..64] == owner.as_ref(), GuardError::WrongTokenAccount);
    Ok(u64::from_le_bytes(data[64..72].try_into().unwrap()))
}
