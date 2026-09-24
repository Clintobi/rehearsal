use anchor_lang::prelude::*;

/// Which leg of the swap is the stablecoin.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Side {
    /// Input is a stablecoin, output is the stock token.
    Buy,
    /// Input is the stock token, output is a stablecoin.
    Sell,
}

/// Where fair value for the stock token comes from.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Reference {
    /// A Pyth `PriceUpdateV2` account, checked for owner, feed id, full verification,
    /// age and confidence width before its price is used.
    Pyth { feed_id: [u8; 32], max_age_secs: u32, max_conf_bps: u16 },
    /// A fixed USD price per displayed token, 6 decimals. Used where no oracle exists
    /// (PreStocks: the app passes the issuer mark), or as a plain limit price.
    Limit { price_e6: u64 },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub struct Policy {
    pub side: Side,
    pub reference: Reference,
    /// Most the fill may be worse than fair value: premium paid on a buy,
    /// discount taken on a sell. 100 = 1%.
    pub tolerance_bps: u16,
}

/// Lives only inside one transaction: created by `open_guard`, closed by `close_guard`.
#[account]
#[derive(InitSpace)]
pub struct Guard {
    pub user: Pubkey,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub input_account: Pubkey,
    pub output_account: Pubkey,
    pub input_before: u64,
    pub output_before: u64,
    pub policy: Policy,
    pub opened_slot: u64,
    pub bump: u8,
}

/// Per-wallet running record of guarded fills.
#[account]
#[derive(InitSpace)]
pub struct Ledger {
    pub user: Pubkey,
    pub fills: u64,
    /// Stablecoin notional that went through the guard, 6 decimals.
    pub volume_e6: u128,
    /// Sum of (fair value received - value given), 6 decimals. Negative means the
    /// user paid over fair value in total, inside their tolerance.
    pub edge_e6: i128,
    pub last_slot: u64,
    pub bump: u8,
}

/// Program-wide counters, so anyone can read total usage on-chain.
#[account]
#[derive(InitSpace)]
pub struct Stats {
    pub fills: u64,
    pub volume_e6: u128,
    pub bump: u8,
}

#[event]
pub struct GuardedFill {
    pub user: Pubkey,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub side: Side,
    pub spent: u64,
    pub received: u64,
    /// USD per displayed token actually paid (buy) or received (sell), 6 decimals.
    pub fill_price_e6: u64,
    /// Fair USD per displayed token used for the check, 6 decimals.
    pub reference_price_e6: u64,
    /// Positive: worse than fair value by this much. Negative: better.
    pub gap_bps: i32,
    pub tolerance_bps: u16,
    pub ui_multiplier_e9: u64,
    pub used_pyth: bool,
    pub slot: u64,
}
