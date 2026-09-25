//! Rehearsal Gate: a Token-2022 transfer hook for Meteora DBC launches quoted in a tokenized stock.
//!
//! While the launch is on its bonding curve, every transfer of the launch token runs this hook. It
//! reads the Rehearsal circuit breaker for the quote stock (kept in sync with Nasdaq's halt feed by
//! the halt relayer) and refuses the transfer while that stock is halted or its breaker has paused
//! trading. During a halt nobody knows what the quote stock is worth, so nobody can know what the
//! launch token costs; the curve waits, the way the listed market does.
//! DBC revokes the hook when the curve completes, so the graduated pool trades normally.
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};
use rehearsal_guard::breaker::{Breaker, BreakerState};
use spl_discriminator::SplDiscriminate;
use spl_tlv_account_resolution::{account::ExtraAccountMeta, state::ExtraAccountMetaList};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

declare_id!("4MtrgDQpbgjpzcAcL5Ftm8E1L37deBnZ5f2Pi6WmpqPE");


#[program]
pub mod rehearsal_gate {
    use super::*;

    /// Bind a launch mint to the breaker of the stock it is quoted in. Run it in the same
    /// transaction that creates the DBC pool, so the binding can't be front-run.
    pub fn init_gate(ctx: Context<InitGate>) -> Result<()> {
        let metas = [ExtraAccountMeta::new_with_pubkey(&ctx.accounts.breaker.key(), false, false)?];
        let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &metas)?;
        emit!(GateBound { mint: ctx.accounts.mint.key(), breaker: ctx.accounts.breaker.key(), feed_id: ctx.accounts.breaker.feed_id });
        Ok(())
    }

    /// Token-2022 calls this on every transfer of the launch token.
    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn execute(ctx: Context<Execute>, _amount: u64) -> Result<()> {
        let b = &ctx.accounts.breaker;
        require!(!b.exchange_halted, GateError::ExchangeHalted);
        require!(b.state != BreakerState::Paused, GateError::BreakerPaused);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitGate<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: created here with the transfer-hook interface's seeds and size.
    #[account(
        init,
        payer = payer,
        space = ExtraAccountMetaList::size_of(1).unwrap(),
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    /// The quote stock's circuit breaker, owned by the Rehearsal Guard program.
    pub breaker: Account<'info, Breaker>,
    pub system_program: Program<'info, System>,
}

// Account order fixed by the transfer-hook interface: source, mint, destination, owner,
// extra-account-metas, then the extra accounts in the order they were registered.
#[derive(Accounts)]
pub struct Execute<'info> {
    #[account(token::mint = mint)]
    pub source: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = mint)]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: owner or delegate of the source account; Token-2022 has already checked it.
    pub owner: UncheckedAccount<'info>,
    /// CHECK: the mint's extra-account-metas PDA.
    #[account(seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    pub breaker: Account<'info, Breaker>,
}

#[event]
pub struct GateBound {
    pub mint: Pubkey,
    pub breaker: Pubkey,
    pub feed_id: [u8; 32],
}

#[error_code]
pub enum GateError {
    #[msg("The stock this token trades against is halted on its primary exchange")]
    ExchangeHalted,
    #[msg("The stock's circuit breaker has paused trading")]
    BreakerPaused,
}
