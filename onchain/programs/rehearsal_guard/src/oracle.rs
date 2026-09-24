use anchor_lang::prelude::*;

use crate::errors::GuardError;

/// Pyth Solana receiver program: owner of every PriceUpdateV2 account, push feeds included.
pub const PYTH_RECEIVER: Pubkey = pubkey!("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");
/// sha256("account:PriceUpdateV2")[..8]
const PRICE_UPDATE_V2_DISC: [u8; 8] = [34, 241, 35, 99, 157, 126, 244, 205];

pub struct OraclePrice {
    pub price: i64,
    pub conf: u64,
    pub expo: i32,
    pub publish_time: i64,
}

/// Decodes a PriceUpdateV2 by hand so the program doesn't pin the Pyth SDK's Anchor version.
/// Layout: disc(8) write_authority(32) verification_level(1 or 2) feed_id(32) price(8)
/// conf(8) exponent(4) publish_time(8) ...
pub fn read_pyth(
    account: &AccountInfo,
    feed_id: &[u8; 32],
    max_age_secs: u32,
    max_conf_bps: u16,
    now: i64,
) -> Result<OraclePrice> {
    require_keys_eq!(*account.owner, PYTH_RECEIVER, GuardError::NotAPythAccount);
    let data = account.try_borrow_data()?;
    require!(data.len() >= 8 + 32 + 1 + 32 + 28, GuardError::NotAPythAccount);
    require!(data[..8] == PRICE_UPDATE_V2_DISC, GuardError::NotAPythAccount);

    // VerificationLevel: 0 = Partial { num_signatures: u8 }, 1 = Full
    let mut o = 40;
    match data[o] {
        1 => o += 1,
        _ => return err!(GuardError::PartiallyVerified),
    }
    require!(&data[o..o + 32] == feed_id, GuardError::WrongFeed);
    o += 32;
    let price = i64::from_le_bytes(data[o..o + 8].try_into().unwrap());
    let conf = u64::from_le_bytes(data[o + 8..o + 16].try_into().unwrap());
    let expo = i32::from_le_bytes(data[o + 16..o + 20].try_into().unwrap());
    let publish_time = i64::from_le_bytes(data[o + 20..o + 28].try_into().unwrap());

    require!(price > 0, GuardError::BadPrice);
    require!(now.saturating_sub(publish_time) <= max_age_secs as i64, GuardError::StalePrice);
    // conf / price <= max_conf_bps / 10_000
    require!(
        (conf as u128) * 10_000 <= (price as u128) * (max_conf_bps as u128),
        GuardError::ConfidenceTooWide
    );
    Ok(OraclePrice { price, conf, expo, publish_time })
}

/// Oracle price as USD with 6 decimals.
pub fn to_e6(p: &OraclePrice) -> Result<u64> {
    let shift = p.expo + 6;
    let v = if shift >= 0 {
        (p.price as u128)
            .checked_mul(10u128.pow(shift as u32))
            .ok_or(GuardError::Overflow)?
    } else {
        (p.price as u128) / 10u128.pow((-shift) as u32)
    };
    u64::try_from(v).map_err(|_| GuardError::Overflow.into())
}
