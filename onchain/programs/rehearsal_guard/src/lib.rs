//! Rehearsal Guard: wrap any swap between `open_guard` and `close_guard` in one
//! transaction. The close measures what the wallet actually spent and received,
//! values the stock leg at Pyth (or a limit price), and reverts the whole transaction
//! if the fill is worse than fair value by more than the wallet's tolerance.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_ID,
};
use anchor_spl::token_interface::{Mint, TokenAccount};

pub mod breaker;
pub mod errors;
pub mod math;
pub mod nyclock;
pub mod oracle;
pub mod orders;
pub mod state;
pub mod tokens;
pub mod zk;
pub mod zk_vk;

use breaker::{Breaker, BreakerChanged, BreakerState};
use errors::GuardError;
use orders::*;
use zk::*;
use state::*;

declare_id!("TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE");

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "Rehearsal Guard",
    project_url: "https://rehearsal-stocklana.vercel.app",
    contacts: "link:https://github.com/Clintobi/rehearsal/security/advisories/new",
    policy: "https://github.com/Clintobi/rehearsal/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/Clintobi/rehearsal/tree/main/onchain"
}

pub const MAX_TOLERANCE_BPS: u16 = 5_000;
/// A breaker older than this can't vouch for the current state; crank it in the same tx.
pub const BREAKER_MAX_STALENESS_SECS: i64 = 60;

/// Tradeable = cranked recently, not paused or in a limit state, and the exchange isn't halted.
pub fn require_tradeable(b: &Breaker, now: i64) -> Result<()> {
    require!(!b.exchange_halted, GuardError::ExchangeHalted);
    require!(now - b.last_crank <= BREAKER_MAX_STALENESS_SECS, GuardError::BreakerStale);
    require!(b.state == BreakerState::Normal, GuardError::TradingPaused);
    Ok(())
}

#[program]
pub mod rehearsal_guard {
    use super::*;

    pub fn open_guard(ctx: Context<OpenGuard>, policy: Policy) -> Result<()> {
        require!(policy.tolerance_bps <= MAX_TOLERANCE_BPS, GuardError::BadTolerance);
        let stable = match policy.side {
            Side::Buy => ctx.accounts.input_mint.key(),
            Side::Sell => ctx.accounts.output_mint.key(),
        };
        require!(tokens::is_stable(&stable), GuardError::NotAStablecoin);

        // A guard left open would protect nothing, so the close must be in this transaction.
        require_close_follows(&ctx.accounts.instructions, &ctx.accounts.guard.key())?;

        let user = ctx.accounts.user.key();
        let output_before = tokens::balance_or_zero(
            &ctx.accounts.output_account,
            &user,
            &ctx.accounts.output_mint.key(),
        )?;

        let g = &mut ctx.accounts.guard;
        g.user = user;
        g.input_mint = ctx.accounts.input_mint.key();
        g.output_mint = ctx.accounts.output_mint.key();
        g.input_account = ctx.accounts.input_account.key();
        g.output_account = ctx.accounts.output_account.key();
        g.input_before = ctx.accounts.input_account.amount;
        g.output_before = output_before;
        g.policy = policy;
        g.opened_slot = Clock::get()?.slot;
        g.bump = ctx.bumps.guard;
        Ok(())
    }

    pub fn close_guard(ctx: Context<CloseGuard>) -> Result<()> {
        let clock = Clock::get()?;
        let g = &ctx.accounts.guard;
        let policy = g.policy;

        if let Some(b) = ctx.accounts.breaker.as_ref() {
            if let Reference::Pyth { feed_id, .. } = policy.reference {
                require!(b.feed_id == feed_id, GuardError::WrongBreaker);
            }
            require_tradeable(b, clock.unix_timestamp)?;
        }

        let spent = g
            .input_before
            .checked_sub(ctx.accounts.input_account.amount)
            .filter(|s| *s > 0)
            .ok_or(GuardError::NothingSpent)?;
        let received = ctx
            .accounts
            .output_account
            .amount
            .checked_sub(g.output_before)
            .filter(|r| *r > 0)
            .ok_or(GuardError::NothingReceived)?;

        // The stock leg: its mint, how much of it moved, and its fair price.
        let (stock_mint, stock_raw) = match policy.side {
            Side::Buy => (&ctx.accounts.output_mint, received),
            Side::Sell => (&ctx.accounts.input_mint, spent),
        };
        let multiplier = tokens::ui_multiplier_e9(&stock_mint.to_account_info(), clock.unix_timestamp)?;
        let stock_ui = math::ui_e9(stock_raw, stock_mint.decimals, multiplier)?;

        let mut age_secs: i64 = 0;
        let (reference_e6, used_pyth) = match policy.reference {
            Reference::Pyth { feed_id, max_age_secs, max_conf_bps } => {
                let acc = ctx
                    .accounts
                    .price_update
                    .as_ref()
                    .ok_or(GuardError::MissingPriceAccount)?;
                let p = oracle::read_pyth(acc, &feed_id, max_age_secs, max_conf_bps, clock.unix_timestamp)?;
                age_secs = (clock.unix_timestamp - p.publish_time).max(0);
                (oracle::to_e6(&p)?, true)
            }
            Reference::Limit { price_e6 } => {
                require!(price_e6 > 0, GuardError::BadPrice);
                (price_e6, false)
            }
        };
        let stock_fair_e6 = math::value_e6(stock_ui, reference_e6)?;

        // given = what the user handed over, received_fair = fair value of what came back
        let (given_e6, received_fair_e6, stable_e6) = match policy.side {
            Side::Buy => {
                let paid = math::stable_e6(spent, ctx.accounts.input_mint.decimals);
                (paid, stock_fair_e6, paid)
            }
            Side::Sell => {
                let got = math::stable_e6(received, ctx.accounts.output_mint.decimals);
                (stock_fair_e6, got, got)
            }
        };
        let gap = math::gap_bps(given_e6, received_fair_e6)?;
        let fill_price_e6 = math::price_e6(stable_e6, stock_ui)?;

        let effective_tol = (policy.tolerance_bps as i64
            + policy.drift_bps_per_hour as i64 * age_secs / 3600)
            .min(MAX_TOLERANCE_BPS as i64) as u16;
        if gap > effective_tol as i32 {
            msg!(
                "Guard: fill ${}e-6 vs fair ${}e-6 is {} bps worse, tolerance {} bps",
                fill_price_e6,
                reference_e6,
                gap,
                effective_tol
            );
            return err!(GuardError::FillWorseThanFair);
        }

        let edge = received_fair_e6 as i128 - given_e6 as i128;
        let ledger = &mut ctx.accounts.ledger;
        ledger.user = g.user;
        ledger.fills = ledger.fills.saturating_add(1);
        ledger.volume_e6 = ledger.volume_e6.saturating_add(stable_e6);
        ledger.edge_e6 = ledger.edge_e6.saturating_add(edge);
        ledger.last_slot = clock.slot;
        ledger.bump = ctx.bumps.ledger;

        let stats = &mut ctx.accounts.stats;
        stats.fills = stats.fills.saturating_add(1);
        stats.volume_e6 = stats.volume_e6.saturating_add(stable_e6);
        stats.bump = ctx.bumps.stats;

        emit!(GuardedFill {
            user: g.user,
            input_mint: g.input_mint,
            output_mint: g.output_mint,
            side: policy.side,
            spent,
            received,
            fill_price_e6,
            reference_price_e6: reference_e6,
            gap_bps: gap,
            tolerance_bps: policy.tolerance_bps,
            ui_multiplier_e9: multiplier,
            used_pyth,
            effective_tolerance_bps: effective_tol,
            slot: clock.slot,
        });
        Ok(())
    }

    pub fn init_breaker(
        ctx: Context<InitBreaker>,
        feed_id: [u8; 32],
        band_bps: u16,
        limit_secs: u32,
        pause_secs: u32,
        max_age_secs: u32,
    ) -> Result<()> {
        require!((50..=5_000).contains(&band_bps), GuardError::BadBreakerParams);
        require!(limit_secs <= 600 && (10..=3_600).contains(&pause_secs) && max_age_secs > 0, GuardError::BadBreakerParams);
        let b = &mut ctx.accounts.breaker;
        b.feed_id = feed_id;
        b.authority = ctx.accounts.authority.key();
        b.band_bps = band_bps;
        b.limit_secs = limit_secs;
        b.pause_secs = pause_secs;
        b.max_age_secs = max_age_secs;
        b.window_secs = 300;
        b.state = BreakerState::Normal;
        b.state_since = Clock::get()?.unix_timestamp;
        b.bump = ctx.bumps.breaker;
        Ok(())
    }

    /// Permissionless: anyone can advance the breaker from the latest Pyth price.
    pub fn crank_breaker(ctx: Context<CrankBreaker>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let b = &mut ctx.accounts.breaker;
        let p = oracle::read_pyth(&ctx.accounts.price_update, &b.feed_id, b.max_age_secs, 10_000, now)?;
        let price_e6 = oracle::to_e6(&p)?;
        let dt = if b.last_publish == 0 { 0 } else { (p.publish_time - b.last_publish).max(0) };
        let before = b.state;
        let x = breaker::step(
            b.reference_e6, b.state, b.state_since, b.paused_until, price_e6, dt, now,
            b.band_bps, b.limit_secs, b.pause_secs, b.window_secs,
        );
        b.reference_e6 = x.reference_e6;
        b.state = x.state;
        b.state_since = x.state_since;
        b.paused_until = x.paused_until;
        if x.tripped {
            b.trips = b.trips.saturating_add(1);
        }
        b.last_price_e6 = price_e6;
        b.last_publish = b.last_publish.max(p.publish_time);
        b.last_crank = now;
        if before != b.state {
            emit!(BreakerChanged {
                feed_id: b.feed_id, state: b.state, exchange_halted: b.exchange_halted, halt_reason: b.halt_reason,
                price_e6, reference_e6: b.reference_e6, deviation_bps: x.deviation_bps, at: now,
            });
        }
        Ok(())
    }

    /// Mirrors a primary-exchange halt or resumption (posted from the exchange's halt feed).
    pub fn set_halt(ctx: Context<SetHalt>, halted: bool, reason: [u8; 4]) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let b = &mut ctx.accounts.breaker;
        if b.exchange_halted != halted {
            b.exchange_halted = halted;
            b.halt_reason = if halted { reason } else { [0; 4] };
            b.halt_since = now;
            emit!(BreakerChanged {
                feed_id: b.feed_id, state: b.state, exchange_halted: halted, halt_reason: b.halt_reason,
                price_e6: b.last_price_e6, reference_e6: b.reference_e6, deviation_bps: 0, at: now,
            });
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn place_order(ctx: Context<PlaceOrder>, nonce: u64, feed_id: [u8; 32], side: Side, amount_in: u64, max_gap_bps: u16, at_open: bool, ttl_secs: u32, at_close: bool) -> Result<()> {
        orders::place(ctx, nonce, feed_id, side, amount_in, max_gap_bps, at_open, ttl_secs, at_close)
    }

    pub fn crank_close(ctx: Context<CrankClose>, feed_id: [u8; 32]) -> Result<()> {
        orders::crank_close(ctx, feed_id)
    }

    pub fn cross_at_close(ctx: Context<CrossAtClose>) -> Result<()> {
        orders::cross_at_close(ctx)
    }

    pub fn fill_order(ctx: Context<FillOrder>, amount_in: u64, amount_out: u64) -> Result<()> {
        orders::fill(ctx, amount_in, amount_out)
    }

    pub fn crank_cross(ctx: Context<CrankCross>, feed_id: [u8; 32]) -> Result<()> {
        orders::crank_cross(ctx, feed_id)
    }

    pub fn cross_orders(ctx: Context<CrossOrders>) -> Result<()> {
        orders::cross_orders(ctx)
    }

    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        orders::cancel(ctx)
    }

    /// Verifies the execution report's SP1 Groth16 proof on-chain and records the attested numbers.
    pub fn attest_report(ctx: Context<AttestReport>, pi_a: [u8; 64], pi_b: [u8; 128], pi_c: [u8; 64], nonce: [u8; 32], public_values: Vec<u8>) -> Result<()> {
        zk::attest(ctx, pi_a, pi_b, pi_c, nonce, public_values)
    }

    /// For any venue to CPI before a fill: fails unless the stock is tradeable right now.
    pub fn check_breaker(ctx: Context<CheckBreaker>) -> Result<()> {
        require_tradeable(&ctx.accounts.breaker, Clock::get()?.unix_timestamp)
    }
}

/// Scans the rest of the transaction for `close_guard` on the same guard account.
fn require_close_follows(instructions: &AccountInfo, guard: &Pubkey) -> Result<()> {
    let current = load_current_index_checked(instructions)? as usize;
    let close_disc = instruction::CloseGuard::DISCRIMINATOR;
    let mut i = current + 1;
    while let Ok(ix) = load_instruction_at_checked(i, instructions) {
        if ix.program_id == crate::ID
            && ix.data.len() >= 8
            && &ix.data[..8] == close_disc
            && ix.accounts.get(1).map(|a| a.pubkey) == Some(*guard)
        {
            return Ok(());
        }
        i += 1;
    }
    err!(GuardError::MissingClose)
}

#[derive(Accounts)]
pub struct OpenGuard<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init,
        payer = user,
        space = 8 + Guard::INIT_SPACE,
        seeds = [b"guard", user.key().as_ref()],
        bump,
    )]
    pub guard: Account<'info, Guard>,
    pub input_mint: InterfaceAccount<'info, Mint>,
    pub output_mint: InterfaceAccount<'info, Mint>,
    #[account(
        token::mint = input_mint,
        token::authority = user,
    )]
    pub input_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: may not exist yet; the swap can create it. Owner and mint are checked
    /// by `balance_or_zero` when it does exist, and again at close.
    pub output_account: UncheckedAccount<'info>,
    /// CHECK: the instructions sysvar, pinned by address.
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseGuard<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        close = user,
        seeds = [b"guard", user.key().as_ref()],
        bump = guard.bump,
        has_one = user,
        has_one = input_mint,
        has_one = output_mint,
        has_one = input_account,
        has_one = output_account,
    )]
    pub guard: Account<'info, Guard>,
    pub input_mint: InterfaceAccount<'info, Mint>,
    pub output_mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = input_mint, token::authority = user)]
    pub input_account: InterfaceAccount<'info, TokenAccount>,
    #[account(token::mint = output_mint, token::authority = user)]
    pub output_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: validated in `oracle::read_pyth` (owner, discriminator, feed id, age, confidence).
    pub price_update: Option<UncheckedAccount<'info>>,
    /// Optional shared circuit breaker for the stock's feed.
    pub breaker: Option<Account<'info, Breaker>>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Ledger::INIT_SPACE,
        seeds = [b"ledger", user.key().as_ref()],
        bump,
    )]
    pub ledger: Account<'info, Ledger>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Stats::INIT_SPACE,
        seeds = [b"stats"],
        bump,
    )]
    pub stats: Account<'info, Stats>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(feed_id: [u8; 32])]
pub struct InitBreaker<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Breaker::INIT_SPACE, seeds = [b"breaker", feed_id.as_ref()], bump)]
    pub breaker: Account<'info, Breaker>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CrankBreaker<'info> {
    #[account(mut, seeds = [b"breaker", breaker.feed_id.as_ref()], bump = breaker.bump)]
    pub breaker: Account<'info, Breaker>,
    /// CHECK: validated in `oracle::read_pyth` against the breaker's feed id.
    pub price_update: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SetHalt<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority, seeds = [b"breaker", breaker.feed_id.as_ref()], bump = breaker.bump)]
    pub breaker: Account<'info, Breaker>,
}

#[derive(Accounts)]
pub struct CheckBreaker<'info> {
    #[account(seeds = [b"breaker", breaker.feed_id.as_ref()], bump = breaker.bump)]
    pub breaker: Account<'info, Breaker>,
}
