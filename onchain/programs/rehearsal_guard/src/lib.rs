//! Rehearsal Guard: wrap any swap between `open_guard` and `close_guard` in one
//! transaction. The close measures what the wallet actually spent and received,
//! values the stock leg at Pyth (or a limit price), and reverts the whole transaction
//! if the fill is worse than fair value by more than the wallet's tolerance.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_ID,
};
use anchor_spl::token_interface::{Mint, TokenAccount};

pub mod errors;
pub mod math;
pub mod oracle;
pub mod state;
pub mod tokens;

use errors::GuardError;
use state::*;

declare_id!("TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE");

pub const MAX_TOLERANCE_BPS: u16 = 5_000;

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

        let (reference_e6, used_pyth) = match policy.reference {
            Reference::Pyth { feed_id, max_age_secs, max_conf_bps } => {
                let acc = ctx
                    .accounts
                    .price_update
                    .as_ref()
                    .ok_or(GuardError::MissingPriceAccount)?;
                let p = oracle::read_pyth(acc, &feed_id, max_age_secs, max_conf_bps, clock.unix_timestamp)?;
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

        if gap > policy.tolerance_bps as i32 {
            msg!(
                "Guard: fill ${}e-6 vs fair ${}e-6 is {} bps worse, tolerance {} bps",
                fill_price_e6,
                reference_e6,
                gap,
                policy.tolerance_bps
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
            slot: clock.slot,
        });
        Ok(())
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
