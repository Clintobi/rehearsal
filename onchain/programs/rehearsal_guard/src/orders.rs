//! Fair orders: resting orders whose limit is fair value, not a number the user typed.
//!
//! - `place_order` escrows the input (a stablecoin to buy, the stock to sell).
//! - `fill_order`: any market maker can fill part or all of it, but only at a price
//!   no worse than Pyth fair value by more than the order's `max_gap_bps`. The program
//!   measures what the owner actually received (after Token-2022 transfer fees) and
//!   records any price improvement.
//! - The opening cross: orders placed with `at_open` wait out a closed market. When the
//!   Pyth feed resumes after a long silence (weekend, holiday), `crank_cross` snapshots
//!   one cross price and opens a short window in which `cross_orders` matches buyers
//!   against sellers, every pair at that same price.
//! - `cancel_order` returns whatever is left.
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::GuardError;
use crate::oracle;
use crate::state::Side;
use crate::{math, tokens};

/// How long the Pyth feed must have been silent for its next update to count as a reopen.
pub const MIN_SILENCE_SECS: i64 = 30 * 60;
/// How long the opening cross accepts matches after the reopen print.
pub const CROSS_WINDOW_SECS: i64 = 5 * 60;
/// Freshness required of the Pyth price used to fill or open a cross.
pub const FILL_MAX_AGE_SECS: u32 = 60;
pub const FILL_MAX_CONF_BPS: u16 = 200;

#[account]
#[derive(InitSpace)]
pub struct FairOrder {
    pub owner: Pubkey,
    pub nonce: u64,
    pub feed_id: [u8; 32],
    pub stock_mint: Pubkey,
    pub stable_mint: Pubkey,
    /// Buy: escrow holds the stablecoin. Sell: escrow holds the stock.
    pub side: Side,
    pub escrow: Pubkey,
    pub remaining_in: u64,
    pub deposited_in: u64,
    pub received_out: u64,
    pub max_gap_bps: u16,
    pub at_open: bool,
    pub created_at: i64,
    pub expires_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct OpeningCross {
    pub feed_id: [u8; 32],
    pub last_publish_seen: i64,
    pub price_e6: u64,
    pub opened_at: i64,
    pub window_end: i64,
    pub pairs: u32,
    pub crossed_usd_e6: u128,
    pub crosses: u32,
    pub bump: u8,
}

#[event]
pub struct OrderFilled {
    pub order: Pubkey,
    pub filler: Pubkey,
    pub side: Side,
    pub amount_in: u64,
    pub received_out: u64,
    pub fill_price_e6: u64,
    pub reference_price_e6: u64,
    /// Positive: worse than fair (within the order's limit). Negative: price improvement.
    pub gap_bps: i32,
}

#[event]
pub struct CrossOpened {
    pub feed_id: [u8; 32],
    pub price_e6: u64,
    pub silence_secs: i64,
    pub window_end: i64,
}

#[event]
pub struct OrdersCrossed {
    pub feed_id: [u8; 32],
    pub buy_order: Pubkey,
    pub sell_order: Pubkey,
    pub price_e6: u64,
    pub stock_raw: u64,
    pub stable_raw: u64,
}

// ---------------------------------------------------------------- place

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct PlaceOrder<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(init, payer = owner, space = 8 + FairOrder::INIT_SPACE, seeds = [b"order", owner.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub order: Account<'info, FairOrder>,
    pub stock_mint: InterfaceAccount<'info, Mint>,
    pub stable_mint: InterfaceAccount<'info, Mint>,
    /// The mint being escrowed: the stablecoin for a buy, the stock for a sell.
    pub in_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = in_mint, token::authority = owner, token::token_program = in_token_program)]
    pub owner_in: InterfaceAccount<'info, TokenAccount>,
    #[account(init, payer = owner, associated_token::mint = in_mint, associated_token::authority = order, associated_token::token_program = in_token_program)]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    pub in_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn place(ctx: Context<PlaceOrder>, nonce: u64, feed_id: [u8; 32], side: Side, amount_in: u64, max_gap_bps: u16, at_open: bool, ttl_secs: u32) -> Result<()> {
    require!(max_gap_bps <= crate::MAX_TOLERANCE_BPS, GuardError::BadTolerance);
    require!(amount_in > 0, GuardError::NothingSpent);
    require!(tokens::is_stable(&ctx.accounts.stable_mint.key()), GuardError::NotAStablecoin);
    let expected_in = match side { Side::Buy => ctx.accounts.stable_mint.key(), Side::Sell => ctx.accounts.stock_mint.key() };
    require_keys_eq!(ctx.accounts.in_mint.key(), expected_in, GuardError::WrongTokenAccount);

    transfer_checked(
        CpiContext::new(ctx.accounts.in_token_program.to_account_info(), TransferChecked {
            from: ctx.accounts.owner_in.to_account_info(),
            mint: ctx.accounts.in_mint.to_account_info(),
            to: ctx.accounts.escrow.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        }),
        amount_in,
        ctx.accounts.in_mint.decimals,
    )?;
    ctx.accounts.escrow.reload()?; // a transfer fee may have been withheld
    let now = Clock::get()?.unix_timestamp;
    let o = &mut ctx.accounts.order;
    o.owner = ctx.accounts.owner.key();
    o.nonce = nonce;
    o.feed_id = feed_id;
    o.stock_mint = ctx.accounts.stock_mint.key();
    o.stable_mint = ctx.accounts.stable_mint.key();
    o.side = side;
    o.escrow = ctx.accounts.escrow.key();
    o.remaining_in = ctx.accounts.escrow.amount;
    o.deposited_in = ctx.accounts.escrow.amount;
    o.max_gap_bps = max_gap_bps;
    o.at_open = at_open;
    o.created_at = now;
    o.expires_at = now + ttl_secs.max(60) as i64;
    o.bump = ctx.bumps.order;
    Ok(())
}

// ---------------------------------------------------------------- fill (market makers)

#[derive(Accounts)]
pub struct FillOrder<'info> {
    pub filler: Signer<'info>,
    #[account(mut, seeds = [b"order", order.owner.as_ref(), &order.nonce.to_le_bytes()], bump = order.bump, has_one = escrow)]
    pub order: Box<Account<'info, FairOrder>>,
    #[account(mut)]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    pub in_mint: Box<InterfaceAccount<'info, Mint>>,
    pub out_mint: Box<InterfaceAccount<'info, Mint>>,
    /// Where the filler receives the escrowed input.
    #[account(mut, token::mint = in_mint, token::token_program = in_token_program)]
    pub filler_in: Box<InterfaceAccount<'info, TokenAccount>>,
    /// What the filler pays from.
    #[account(mut, token::mint = out_mint, token::authority = filler, token::token_program = out_token_program)]
    pub filler_out: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The order owner's account for the output.
    #[account(mut, token::mint = out_mint, token::authority = order.owner, token::token_program = out_token_program)]
    pub owner_out: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: validated by `oracle::read_pyth` against the order's feed.
    pub price_update: UncheckedAccount<'info>,
    pub breaker: Option<Account<'info, crate::breaker::Breaker>>,
    pub in_token_program: Interface<'info, TokenInterface>,
    pub out_token_program: Interface<'info, TokenInterface>,
}

pub fn fill(ctx: Context<FillOrder>, amount_in: u64, amount_out: u64) -> Result<()> {
    let clock = Clock::get()?;
    let o = &ctx.accounts.order;
    require!(!o.at_open, GuardError::CrossOnly);
    require!(clock.unix_timestamp < o.expires_at, GuardError::OrderExpired);
    require!(amount_in > 0 && amount_in <= o.remaining_in, GuardError::NothingSpent);
    let (in_key, out_key) = match o.side { Side::Buy => (o.stable_mint, o.stock_mint), Side::Sell => (o.stock_mint, o.stable_mint) };
    require_keys_eq!(ctx.accounts.in_mint.key(), in_key, GuardError::WrongTokenAccount);
    require_keys_eq!(ctx.accounts.out_mint.key(), out_key, GuardError::WrongTokenAccount);
    if let Some(b) = ctx.accounts.breaker.as_ref() {
        require!(b.feed_id == o.feed_id, GuardError::WrongBreaker);
        crate::require_tradeable(b, clock.unix_timestamp)?;
    }

    // Filler pays the owner; measure what actually arrived.
    let before = ctx.accounts.owner_out.amount;
    transfer_checked(
        CpiContext::new(ctx.accounts.out_token_program.to_account_info(), TransferChecked {
            from: ctx.accounts.filler_out.to_account_info(),
            mint: ctx.accounts.out_mint.to_account_info(),
            to: ctx.accounts.owner_out.to_account_info(),
            authority: ctx.accounts.filler.to_account_info(),
        }),
        amount_out,
        ctx.accounts.out_mint.decimals,
    )?;
    ctx.accounts.owner_out.reload()?;
    let received = ctx.accounts.owner_out.amount.checked_sub(before).filter(|r| *r > 0).ok_or(GuardError::NothingReceived)?;

    // Escrow pays the filler.
    let owner = o.owner;
    let nonce = o.nonce.to_le_bytes();
    let seeds: &[&[u8]] = &[b"order", owner.as_ref(), &nonce, &[o.bump]];
    transfer_checked(
        CpiContext::new_with_signer(ctx.accounts.in_token_program.to_account_info(), TransferChecked {
            from: ctx.accounts.escrow.to_account_info(),
            mint: ctx.accounts.in_mint.to_account_info(),
            to: ctx.accounts.filler_in.to_account_info(),
            authority: ctx.accounts.order.to_account_info(),
        }, &[seeds]),
        amount_in,
        ctx.accounts.in_mint.decimals,
    )?;

    // Price check against Pyth.
    let p = oracle::read_pyth(&ctx.accounts.price_update, &ctx.accounts.order.feed_id, FILL_MAX_AGE_SECS, FILL_MAX_CONF_BPS, clock.unix_timestamp)?;
    let ref_e6 = oracle::to_e6(&p)?;
    let side = ctx.accounts.order.side;
    let (stock_mint, stock_raw) = match side { Side::Buy => (&ctx.accounts.out_mint, received), Side::Sell => (&ctx.accounts.in_mint, amount_in) };
    let mult = tokens::ui_multiplier_e9(&stock_mint.to_account_info(), clock.unix_timestamp)?;
    let stock_ui = math::ui_e9(stock_raw, stock_mint.decimals, mult)?;
    let fair = math::value_e6(stock_ui, ref_e6)?;
    let (given, fair_back, stable) = match side {
        Side::Buy => { let paid = math::stable_e6(amount_in, ctx.accounts.in_mint.decimals); (paid, fair, paid) }
        Side::Sell => { let got = math::stable_e6(received, ctx.accounts.out_mint.decimals); (fair, got, got) }
    };
    let gap = math::gap_bps(given, fair_back)?;
    require!(gap <= ctx.accounts.order.max_gap_bps as i32, GuardError::FillWorseThanFair);

    let o = &mut ctx.accounts.order;
    o.remaining_in -= amount_in;
    o.received_out = o.received_out.saturating_add(received);
    emit!(OrderFilled {
        order: o.key(), filler: ctx.accounts.filler.key(), side, amount_in, received_out: received,
        fill_price_e6: math::price_e6(stable, stock_ui)?, reference_price_e6: ref_e6, gap_bps: gap,
    });
    Ok(())
}

// ---------------------------------------------------------------- opening cross

#[derive(Accounts)]
#[instruction(feed_id: [u8; 32])]
pub struct CrankCross<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init_if_needed, payer = payer, space = 8 + OpeningCross::INIT_SPACE, seeds = [b"cross", feed_id.as_ref()], bump)]
    pub cross: Account<'info, OpeningCross>,
    /// CHECK: validated by `oracle::read_pyth`.
    pub price_update: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Permissionless. Records the feed's latest publish time; if the feed just resumed after
/// at least MIN_SILENCE_SECS of silence, snapshots the cross price and opens the window.
pub fn crank_cross(ctx: Context<CrankCross>, feed_id: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    // The reopen print must be fresh; the silence before it is what makes it a reopen.
    let p = oracle::read_pyth(&ctx.accounts.price_update, &feed_id, 3 * 24 * 3600, FILL_MAX_CONF_BPS, now)?;
    let c = &mut ctx.accounts.cross;
    if c.feed_id == [0; 32] {
        c.feed_id = feed_id;
        c.bump = ctx.bumps.cross;
    }
    let silence = p.publish_time - c.last_publish_seen;
    if c.last_publish_seen > 0 && silence >= MIN_SILENCE_SECS && now - p.publish_time <= FILL_MAX_AGE_SECS as i64 {
        c.price_e6 = oracle::to_e6(&p)?;
        c.opened_at = now;
        c.window_end = now + CROSS_WINDOW_SECS;
        c.pairs = 0;
        c.crossed_usd_e6 = 0;
        c.crosses = c.crosses.saturating_add(1);
        emit!(CrossOpened { feed_id, price_e6: c.price_e6, silence_secs: silence, window_end: c.window_end });
    }
    c.last_publish_seen = c.last_publish_seen.max(p.publish_time);
    Ok(())
}

#[derive(Accounts)]
pub struct CrossOrders<'info> {
    #[account(mut, seeds = [b"cross", cross.feed_id.as_ref()], bump = cross.bump)]
    pub cross: Box<Account<'info, OpeningCross>>,
    #[account(mut, seeds = [b"order", buy_order.owner.as_ref(), &buy_order.nonce.to_le_bytes()], bump = buy_order.bump)]
    pub buy_order: Box<Account<'info, FairOrder>>,
    #[account(mut, address = buy_order.escrow)]
    pub buy_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, seeds = [b"order", sell_order.owner.as_ref(), &sell_order.nonce.to_le_bytes()], bump = sell_order.bump)]
    pub sell_order: Box<Account<'info, FairOrder>>,
    #[account(mut, address = sell_order.escrow)]
    pub sell_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The buyer's account for the stock.
    #[account(mut, token::mint = stock_mint, token::authority = buy_order.owner, token::token_program = stock_token_program)]
    pub buyer_stock: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The seller's account for the stablecoin.
    #[account(mut, token::mint = stable_mint, token::authority = sell_order.owner, token::token_program = stable_token_program)]
    pub seller_stable: Box<InterfaceAccount<'info, TokenAccount>>,
    pub stock_mint: Box<InterfaceAccount<'info, Mint>>,
    pub stable_mint: Box<InterfaceAccount<'info, Mint>>,
    pub stock_token_program: Interface<'info, TokenInterface>,
    pub stable_token_program: Interface<'info, TokenInterface>,
}

/// Permissionless. Matches one buy order with one sell order at the cross price.
pub fn cross_orders(ctx: Context<CrossOrders>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let c = &ctx.accounts.cross;
    let (b, s) = (&ctx.accounts.buy_order, &ctx.accounts.sell_order);
    require!(c.opened_at > 0 && now <= c.window_end, GuardError::CrossClosed);
    require!(b.at_open && s.at_open, GuardError::CrossOnly);
    require!(b.side == Side::Buy && s.side == Side::Sell, GuardError::WrongOrder);
    require!(b.feed_id == c.feed_id && s.feed_id == c.feed_id, GuardError::WrongOrder);
    require!(b.stock_mint == s.stock_mint && b.stable_mint == s.stable_mint, GuardError::WrongOrder);
    require_keys_eq!(ctx.accounts.stock_mint.key(), b.stock_mint, GuardError::WrongOrder);
    require_keys_eq!(ctx.accounts.stable_mint.key(), b.stable_mint, GuardError::WrongOrder);
    // Only orders that waited out the closed market join the cross.
    require!(b.created_at < c.opened_at && s.created_at < c.opened_at, GuardError::WrongOrder);
    require!(now < b.expires_at && now < s.expires_at, GuardError::OrderExpired);

    let stock_dec = ctx.accounts.stock_mint.decimals;
    let stable_dec = ctx.accounts.stable_mint.decimals;
    let mult = tokens::ui_multiplier_e9(&ctx.accounts.stock_mint.to_account_info(), now)?;

    let (stock_raw, stable_raw, usd_e6) = math::cross_quantities(b.remaining_in, stable_dec, s.remaining_in, stock_dec, mult as u64, c.price_e6)?;
    require!(stock_raw > 0 && stable_raw > 0, GuardError::NothingToCross);

    let (sell_owner, sell_nonce, sell_bump) = (s.owner, s.nonce.to_le_bytes(), s.bump);
    let (buy_owner, buy_nonce, buy_bump) = (b.owner, b.nonce.to_le_bytes(), b.bump);
    let sell_seeds: &[&[u8]] = &[b"order", sell_owner.as_ref(), &sell_nonce, &[sell_bump]];
    let buy_seeds: &[&[u8]] = &[b"order", buy_owner.as_ref(), &buy_nonce, &[buy_bump]];

    let before = ctx.accounts.buyer_stock.amount;
    transfer_checked(
        CpiContext::new_with_signer(ctx.accounts.stock_token_program.to_account_info(), TransferChecked {
            from: ctx.accounts.sell_escrow.to_account_info(),
            mint: ctx.accounts.stock_mint.to_account_info(),
            to: ctx.accounts.buyer_stock.to_account_info(),
            authority: ctx.accounts.sell_order.to_account_info(),
        }, &[sell_seeds]),
        stock_raw, stock_dec,
    )?;
    transfer_checked(
        CpiContext::new_with_signer(ctx.accounts.stable_token_program.to_account_info(), TransferChecked {
            from: ctx.accounts.buy_escrow.to_account_info(),
            mint: ctx.accounts.stable_mint.to_account_info(),
            to: ctx.accounts.seller_stable.to_account_info(),
            authority: ctx.accounts.buy_order.to_account_info(),
        }, &[buy_seeds]),
        stable_raw, stable_dec,
    )?;
    ctx.accounts.buyer_stock.reload()?;
    let delivered = ctx.accounts.buyer_stock.amount.saturating_sub(before);

    let b = &mut ctx.accounts.buy_order;
    b.remaining_in -= stable_raw;
    b.received_out = b.received_out.saturating_add(delivered);
    let s = &mut ctx.accounts.sell_order;
    s.remaining_in -= stock_raw;
    s.received_out = s.received_out.saturating_add(stable_raw);
    let c = &mut ctx.accounts.cross;
    c.pairs = c.pairs.saturating_add(1);
    c.crossed_usd_e6 = c.crossed_usd_e6.saturating_add(usd_e6);
    emit!(OrdersCrossed {
        feed_id: c.feed_id, buy_order: ctx.accounts.buy_order.key(), sell_order: ctx.accounts.sell_order.key(),
        price_e6: c.price_e6, stock_raw, stable_raw,
    });
    Ok(())
}

// ---------------------------------------------------------------- cancel

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, close = owner, has_one = owner, has_one = escrow, seeds = [b"order", owner.key().as_ref(), &order.nonce.to_le_bytes()], bump = order.bump)]
    pub order: Account<'info, FairOrder>,
    #[account(mut)]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    pub in_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = in_mint, token::authority = owner, token::token_program = in_token_program)]
    pub owner_in: InterfaceAccount<'info, TokenAccount>,
    pub in_token_program: Interface<'info, TokenInterface>,
}

pub fn cancel(ctx: Context<CancelOrder>) -> Result<()> {
    let o = &ctx.accounts.order;
    let (owner, nonce, bump) = (o.owner, o.nonce.to_le_bytes(), o.bump);
    let seeds: &[&[u8]] = &[b"order", owner.as_ref(), &nonce, &[bump]];
    let left = ctx.accounts.escrow.amount;
    if left > 0 {
        transfer_checked(
            CpiContext::new_with_signer(ctx.accounts.in_token_program.to_account_info(), TransferChecked {
                from: ctx.accounts.escrow.to_account_info(),
                mint: ctx.accounts.in_mint.to_account_info(),
                to: ctx.accounts.owner_in.to_account_info(),
                authority: ctx.accounts.order.to_account_info(),
            }, &[seeds]),
            left, ctx.accounts.in_mint.decimals,
        )?;
    }
    // A Token-2022 escrow can hold withheld transfer fees, which block closing it; those
    // stay open (their rent is small) and classic-token escrows are closed.
    if ctx.accounts.in_token_program.key() == anchor_spl::token::ID {
        close_account(CpiContext::new_with_signer(ctx.accounts.in_token_program.to_account_info(), CloseAccount {
            account: ctx.accounts.escrow.to_account_info(),
            destination: ctx.accounts.owner.to_account_info(),
            authority: ctx.accounts.order.to_account_info(),
        }, &[seeds]))?;
    }
    Ok(())
}
