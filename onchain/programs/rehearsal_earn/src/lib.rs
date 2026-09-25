//! Rehearsal Earn: weekly covered calls and cash-secured puts on tokenized stocks.
//!
//! - Writers escrow the stock (a call) or a stablecoin (a put) in a series and set the
//!   premium they want per token. Anyone can buy, market makers included; the premium goes
//!   straight to the writer's wallet.
//! - Every series expires at a 16:00 New York close. It settles on the last Pyth price
//!   published at or before the close. `snapshot` keeps the latest such price, so a later
//!   print always replaces an earlier one and nobody can pick a favourable one. The free
//!   Pyth equity feeds stop at 16:00, so that price stays readable until the next open.
//! - `finalize` fixes the price 15 minutes after the close. If nothing within 2 minutes of
//!   the close arrived (a halt, a holiday), it waits 24 hours and settles on the latest price
//!   it has, flagged stale. With no price at all after 7 days the options expire worthless.
//! - Calls pay out in the stock, puts in the stablecoin, both from the series vault.
use anchor_lang::prelude::*;
use anchor_lang::AccountsExit;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};
use rehearsal_guard::{nyclock, oracle, tokens};

pub mod payoff;

declare_id!("FDkUBYhiH45BJd4svgHFw8tjSdrYVabcJhenpo81AsjV");

pub const CALL: u8 = 0;
pub const PUT: u8 = 1;
/// Writing and buying stop this long before the close.
pub const TRADING_CUTOFF_SECS: i64 = 15 * 60;
/// A settlement price must be published at most this long before the close.
pub const MAX_CLOSE_AGE_SECS: i64 = 120;
/// Snapshots are accepted from this long before the close.
pub const SNAPSHOT_FROM_SECS: i64 = 5 * 60;
/// Time after the close for anyone to post a later print before the price is fixed.
pub const FINALIZE_DELAY_SECS: i64 = 15 * 60;
pub const STALE_GRACE_SECS: i64 = 24 * 3600;
pub const VOID_AFTER_SECS: i64 = 7 * 24 * 3600;
const PYTH_MAX_AGE_SECS: u32 = 8 * 24 * 3600;
const MAX_CONF_BPS: u16 = 200;

#[program]
pub mod rehearsal_earn {
    use super::*;

    /// Lists a stock and its Pyth feed. Only the program's upgrade authority can do this,
    /// so nobody can open series priced off the wrong feed.
    pub fn create_market(ctx: Context<CreateMarket>, feed_id: [u8; 32]) -> Result<()> {
        let m = &mut ctx.accounts.market;
        m.stock_mint = ctx.accounts.stock_mint.key();
        m.feed_id = feed_id;
        m.bump = ctx.bumps.market;
        Ok(())
    }

    /// Opens a series: one stock, call or put, one strike, one 16:00 New York expiry.
    /// `strike_e6` is USD per whole token (share price x the token's multiplier).
    pub fn create_series(ctx: Context<CreateSeries>, kind: u8, strike_e6: u64, expiry: i64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(kind == CALL || kind == PUT, EarnError::BadSeries);
        require!(strike_e6 > 0, EarnError::BadSeries);
        require!(nyclock::session_close(expiry) == Some(expiry), EarnError::NotAClose);
        require!(expiry > now + TRADING_CUTOFF_SECS, EarnError::TradingClosed);
        let stable = &ctx.accounts.stable_mint;
        require!(tokens::is_stable(&stable.key()) && stable.decimals == 6, EarnError::NotAStablecoin);
        let expected = if kind == CALL { ctx.accounts.stock_mint.key() } else { stable.key() };
        require_keys_eq!(ctx.accounts.collateral_mint.key(), expected, EarnError::BadSeries);

        let s = &mut ctx.accounts.series;
        s.market = ctx.accounts.market.key();
        s.stock_mint = ctx.accounts.stock_mint.key();
        s.stable_mint = stable.key();
        s.collateral_mint = expected;
        s.vault = ctx.accounts.vault.key();
        s.feed_id = ctx.accounts.market.feed_id;
        s.kind = kind;
        s.strike_e6 = strike_e6;
        s.expiry = expiry;
        s.stock_decimals = ctx.accounts.stock_mint.decimals;
        s.bump = ctx.bumps.series;
        emit!(SeriesCreated { series: s.key(), stock_mint: s.stock_mint, kind, strike_e6, expiry });
        Ok(())
    }

    /// Escrows collateral for `contracts` (raw units of the stock) and sets the premium
    /// the writer wants per whole token. Writing more updates the ask for the whole position.
    pub fn write_options(ctx: Context<WriteOptions>, contracts: u64, ask_e6: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(contracts > 0, EarnError::Zero);
        require!(now < ctx.accounts.series.expiry - TRADING_CUTOFF_SECS, EarnError::TradingClosed);
        let need = collateral_for(&ctx.accounts.series, contracts)?;

        let before = ctx.accounts.vault.amount;
        transfer_checked(
            CpiContext::new(ctx.accounts.collateral_token_program.to_account_info(), TransferChecked {
                from: ctx.accounts.owner_collateral.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            }),
            need,
            ctx.accounts.collateral_mint.decimals,
        )?;
        ctx.accounts.vault.reload()?;
        // A transfer fee would leave the vault short of what the options promise.
        require!(ctx.accounts.vault.amount.saturating_sub(before) == need, EarnError::TransferFee);

        let series_key = ctx.accounts.series.key();
        let p = &mut ctx.accounts.position;
        if p.owner == Pubkey::default() {
            p.series = series_key;
            p.owner = ctx.accounts.owner.key();
            p.bump = ctx.bumps.position;
        }
        p.contracts = p.contracts.checked_add(contracts).ok_or(EarnError::Overflow)?;
        p.collateral = p.collateral.checked_add(need).ok_or(EarnError::Overflow)?;
        p.ask_e6 = ask_e6;
        let s = &mut ctx.accounts.series;
        s.written = s.written.checked_add(contracts).ok_or(EarnError::Overflow)?;
        emit!(Written { series: series_key, owner: p.owner, contracts, collateral: need, ask_e6 });
        Ok(())
    }

    pub fn set_ask(ctx: Context<SetAsk>, ask_e6: u64) -> Result<()> {
        ctx.accounts.position.ask_e6 = ask_e6;
        Ok(())
    }

    /// Takes back collateral for contracts nobody has bought. Allowed until settlement.
    pub fn unwrite(ctx: Context<Unwrite>, contracts: u64) -> Result<()> {
        let s = &ctx.accounts.series;
        require!(!s.settled, EarnError::AlreadySettled);
        let p = &ctx.accounts.position;
        require!(contracts > 0 && contracts <= p.contracts - p.sold, EarnError::Zero);
        let left = p.contracts - contracts;
        let release = if s.kind == CALL {
            contracts
        } else {
            p.collateral - payoff::put_collateral(left, s.strike_e6, s.stock_decimals).ok_or(EarnError::Overflow)?
        };
        pay_from_vault(
            s,
            &ctx.accounts.series.to_account_info(),
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.collateral_mint,
            &ctx.accounts.owner_collateral.to_account_info(),
            &ctx.accounts.collateral_token_program.to_account_info(),
            release,
        )?;
        let p = &mut ctx.accounts.position;
        p.contracts = left;
        p.collateral -= release;
        ctx.accounts.series.written -= contracts;
        Ok(())
    }

    /// Buys up to `contracts` from the writers passed as remaining accounts, in pairs of
    /// (writer position, writer's stablecoin account), skipping any asking more than
    /// `max_ask_e6`. Each writer is paid their own ask. Fails if nothing fills.
    pub fn buy<'info>(ctx: Context<'_, '_, 'info, 'info, Buy<'info>>, contracts: u64, max_ask_e6: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(contracts > 0, EarnError::Zero);
        let series_key = ctx.accounts.series.key();
        let decimals = ctx.accounts.series.stock_decimals;
        require!(now < ctx.accounts.series.expiry - TRADING_CUTOFF_SECS, EarnError::TradingClosed);
        let rem = ctx.remaining_accounts;
        require!(!rem.is_empty() && rem.len() % 2 == 0, EarnError::WrongPosition);

        let (mut left, mut filled, mut paid) = (contracts, 0u64, 0u64);
        for pair in rem.chunks(2) {
            if left == 0 {
                break;
            }
            require!(pair[0].is_writable && pair[1].is_writable, EarnError::WrongPosition);
            let mut pos: Account<'info, Position> = Account::try_from(&pair[0])?;
            require_keys_eq!(pos.series, series_key, EarnError::WrongPosition);
            let unsold = pos.contracts - pos.sold;
            if unsold == 0 || pos.ask_e6 > max_ask_e6 {
                continue;
            }
            let take = unsold.min(left);
            let fee = payoff::premium(take, pos.ask_e6, decimals).ok_or(EarnError::Overflow)?;
            let dest = InterfaceAccount::<TokenAccount>::try_from(&pair[1])?;
            require_keys_eq!(dest.owner, pos.owner, EarnError::WrongPosition);
            require_keys_eq!(dest.mint, ctx.accounts.stable_mint.key(), EarnError::WrongPosition);
            if fee > 0 {
                transfer_checked(
                    CpiContext::new(ctx.accounts.stable_token_program.to_account_info(), TransferChecked {
                        from: ctx.accounts.buyer_stable.to_account_info(),
                        mint: ctx.accounts.stable_mint.to_account_info(),
                        to: pair[1].clone(),
                        authority: ctx.accounts.buyer.to_account_info(),
                    }),
                    fee,
                    ctx.accounts.stable_mint.decimals,
                )?;
            }
            pos.sold += take;
            pos.exit(&crate::ID)?;
            left -= take;
            filled += take;
            paid = paid.checked_add(fee).ok_or(EarnError::Overflow)?;
            emit!(Bought { series: series_key, buyer: ctx.accounts.buyer.key(), writer: pos.owner, contracts: take, premium: fee, ask_e6: pos.ask_e6 });
        }
        require!(filled > 0, EarnError::NothingToBuy);

        let h = &mut ctx.accounts.holding;
        if h.owner == Pubkey::default() {
            h.series = series_key;
            h.owner = ctx.accounts.buyer.key();
            h.bump = ctx.bumps.holding;
        }
        h.contracts = h.contracts.checked_add(filled).ok_or(EarnError::Overflow)?;
        let s = &mut ctx.accounts.series;
        s.sold += filled;
        s.premium_paid = s.premium_paid.checked_add(paid).ok_or(EarnError::Overflow)?;
        Ok(())
    }

    /// Permissionless. Records a Pyth price published at or before the close if it's later
    /// than the one already recorded.
    pub fn snapshot(ctx: Context<Snapshot>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let s = &mut ctx.accounts.series;
        require!(!s.settled, EarnError::AlreadySettled);
        require!(now >= s.expiry - SNAPSHOT_FROM_SECS, EarnError::TooEarly);
        let p = oracle::read_pyth(&ctx.accounts.price_update.to_account_info(), &s.feed_id, PYTH_MAX_AGE_SECS, MAX_CONF_BPS, now)?;
        require!(p.publish_time <= s.expiry, EarnError::AfterClose);
        if p.publish_time > s.snap_publish {
            let share = oracle::to_e6(&p)?;
            let m = tokens::ui_multiplier_e9(&ctx.accounts.stock_mint.to_account_info(), s.expiry)?;
            s.snap_price_e6 = payoff::token_price_e6(share, m).ok_or(EarnError::Overflow)?;
            s.snap_publish = p.publish_time;
            emit!(ClosePrice { series: s.key(), share_price_e6: share, multiplier_e9: m, token_price_e6: s.snap_price_e6, publish_time: p.publish_time });
        }
        Ok(())
    }

    /// Permissionless. Fixes the settlement price once the window for later prints is over.
    pub fn finalize(ctx: Context<Finalize>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let s = &mut ctx.accounts.series;
        require!(!s.settled, EarnError::AlreadySettled);
        require!(now >= s.expiry + FINALIZE_DELAY_SECS, EarnError::TooEarly);
        if s.snap_publish > 0 && s.snap_publish >= s.expiry - MAX_CLOSE_AGE_SECS {
            s.settle_price_e6 = s.snap_price_e6;
        } else if s.snap_publish > 0 && now >= s.expiry + STALE_GRACE_SECS {
            s.settle_price_e6 = s.snap_price_e6;
            s.stale = true;
        } else if now >= s.expiry + VOID_AFTER_SECS {
            // No price ever arrived: settling at the strike pays nothing to either side.
            s.settle_price_e6 = s.strike_e6;
            s.voided = true;
        } else {
            return err!(EarnError::NoClosePrice);
        }
        s.settled = true;
        emit!(Settled { series: s.key(), price_e6: s.settle_price_e6, publish_time: s.snap_publish, stale: s.stale, voided: s.voided });
        Ok(())
    }

    /// Pays a buyer: the gain in the stock for a call, the shortfall in stablecoin for a put.
    pub fn claim_buyer(ctx: Context<ClaimBuyer>) -> Result<()> {
        let s = &ctx.accounts.series;
        require!(s.settled, EarnError::NotSettled);
        let c = ctx.accounts.holding.contracts;
        let out = if s.kind == CALL {
            payoff::call_payout(c, s.strike_e6, s.settle_price_e6, false)
        } else {
            payoff::put_payout(c, s.strike_e6, s.settle_price_e6, s.stock_decimals, false)
        }
        .ok_or(EarnError::Overflow)?;
        pay_from_vault(
            s,
            &ctx.accounts.series.to_account_info(),
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.collateral_mint,
            &ctx.accounts.owner_collateral.to_account_info(),
            &ctx.accounts.collateral_token_program.to_account_info(),
            out,
        )?;
        emit!(Claimed { series: s.key(), owner: ctx.accounts.owner.key(), writer: false, amount: out });
        Ok(())
    }

    /// Returns a writer's collateral minus what their sold contracts owe.
    pub fn claim_writer(ctx: Context<ClaimWriter>) -> Result<()> {
        let s = &ctx.accounts.series;
        require!(s.settled, EarnError::NotSettled);
        let p = &ctx.accounts.position;
        let owed = if s.kind == CALL {
            payoff::call_payout(p.sold, s.strike_e6, s.settle_price_e6, true)
        } else {
            payoff::put_payout(p.sold, s.strike_e6, s.settle_price_e6, s.stock_decimals, true)
        }
        .ok_or(EarnError::Overflow)?;
        let back = p.collateral.checked_sub(owed).ok_or(EarnError::Overflow)?;
        pay_from_vault(
            s,
            &ctx.accounts.series.to_account_info(),
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.collateral_mint,
            &ctx.accounts.owner_collateral.to_account_info(),
            &ctx.accounts.collateral_token_program.to_account_info(),
            back,
        )?;
        emit!(Claimed { series: s.key(), owner: ctx.accounts.owner.key(), writer: true, amount: back });
        Ok(())
    }
}

fn collateral_for(s: &Series, contracts: u64) -> Result<u64> {
    if s.kind == CALL {
        Ok(contracts)
    } else {
        payoff::put_collateral(contracts, s.strike_e6, s.stock_decimals).ok_or(EarnError::Overflow.into())
    }
}

fn pay_from_vault<'info>(
    s: &Series,
    series: &AccountInfo<'info>,
    vault: &AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let kind = [s.kind];
    let strike = s.strike_e6.to_le_bytes();
    let expiry = s.expiry.to_le_bytes();
    let bump = [s.bump];
    let seeds: &[&[u8]] = &[b"series", s.market.as_ref(), &kind, &strike, &expiry, s.stable_mint.as_ref(), &bump];
    transfer_checked(
        CpiContext::new_with_signer(
            token_program.clone(),
            TransferChecked { from: vault.clone(), mint: mint.to_account_info(), to: to.clone(), authority: series.clone() },
            &[seeds],
        ),
        amount,
        mint.decimals,
    )
}

// ---------------------------------------------------------------- state

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub stock_mint: Pubkey,
    pub feed_id: [u8; 32],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Series {
    pub market: Pubkey,
    pub stock_mint: Pubkey,
    pub stable_mint: Pubkey,
    /// The stock for a call, the stablecoin for a put.
    pub collateral_mint: Pubkey,
    pub vault: Pubkey,
    pub feed_id: [u8; 32],
    pub kind: u8,
    /// USD per whole token, 6 decimals.
    pub strike_e6: u64,
    /// 16:00 New York, unix seconds.
    pub expiry: i64,
    pub stock_decimals: u8,
    pub written: u64,
    pub sold: u64,
    pub premium_paid: u64,
    /// Latest price per whole token published at or before the close.
    pub snap_price_e6: u64,
    pub snap_publish: i64,
    pub settled: bool,
    pub settle_price_e6: u64,
    pub stale: bool,
    pub voided: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub series: Pubkey,
    pub owner: Pubkey,
    pub contracts: u64,
    pub sold: u64,
    /// Collateral in the vault for this writer (raw units of the collateral mint).
    pub collateral: u64,
    /// Premium wanted per whole token, USD 6 decimals.
    pub ask_e6: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Holding {
    pub series: Pubkey,
    pub owner: Pubkey,
    pub contracts: u64,
    pub bump: u8,
}

// ---------------------------------------------------------------- accounts

#[derive(Accounts)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Market::INIT_SPACE, seeds = [b"market", stock_mint.key().as_ref()], bump)]
    pub market: Account<'info, Market>,
    pub stock_mint: InterfaceAccount<'info, Mint>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ EarnError::NotAdmin)]
    pub program: Program<'info, crate::program::RehearsalEarn>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ EarnError::NotAdmin)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(kind: u8, strike_e6: u64, expiry: i64)]
pub struct CreateSeries<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(has_one = stock_mint)]
    pub market: Box<Account<'info, Market>>,
    pub stock_mint: Box<InterfaceAccount<'info, Mint>>,
    pub stable_mint: Box<InterfaceAccount<'info, Mint>>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init, payer = payer, space = 8 + Series::INIT_SPACE,
        seeds = [b"series", market.key().as_ref(), &[kind], &strike_e6.to_le_bytes(), &expiry.to_le_bytes(), stable_mint.key().as_ref()],
        bump
    )]
    pub series: Box<Account<'info, Series>>,
    #[account(
        init, payer = payer, seeds = [b"vault", series.key().as_ref()], bump,
        token::mint = collateral_mint, token::authority = series, token::token_program = collateral_token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub collateral_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WriteOptions<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, has_one = vault, has_one = collateral_mint)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        init_if_needed, payer = owner, space = 8 + Position::INIT_SPACE,
        seeds = [b"write", series.key().as_ref(), owner.key().as_ref()], bump
    )]
    pub position: Box<Account<'info, Position>>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = collateral_mint, token::authority = owner, token::token_program = collateral_token_program)]
    pub owner_collateral: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub collateral_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetAsk<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner)]
    pub position: Account<'info, Position>,
}

#[derive(Accounts)]
pub struct Unwrite<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = vault, has_one = collateral_mint)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut, seeds = [b"write", series.key().as_ref(), owner.key().as_ref()], bump = position.bump, has_one = owner)]
    pub position: Box<Account<'info, Position>>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = collateral_mint, token::authority = owner, token::token_program = collateral_token_program)]
    pub owner_collateral: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub collateral_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut, has_one = stable_mint)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        init_if_needed, payer = buyer, space = 8 + Holding::INIT_SPACE,
        seeds = [b"hold", series.key().as_ref(), buyer.key().as_ref()], bump
    )]
    pub holding: Box<Account<'info, Holding>>,
    pub stable_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = stable_mint, token::authority = buyer, token::token_program = stable_token_program)]
    pub buyer_stable: Box<InterfaceAccount<'info, TokenAccount>>,
    pub stable_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Snapshot<'info> {
    #[account(mut, has_one = stock_mint)]
    pub series: Account<'info, Series>,
    pub stock_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: validated by `oracle::read_pyth` against the series' feed.
    pub price_update: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Finalize<'info> {
    #[account(mut)]
    pub series: Account<'info, Series>,
}

#[derive(Accounts)]
pub struct ClaimBuyer<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(has_one = vault, has_one = collateral_mint)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut, seeds = [b"hold", series.key().as_ref(), owner.key().as_ref()], bump = holding.bump, has_one = owner, close = owner)]
    pub holding: Box<Account<'info, Holding>>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = collateral_mint, token::authority = owner, token::token_program = collateral_token_program)]
    pub owner_collateral: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub collateral_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ClaimWriter<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(has_one = vault, has_one = collateral_mint)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut, seeds = [b"write", series.key().as_ref(), owner.key().as_ref()], bump = position.bump, has_one = owner, close = owner)]
    pub position: Box<Account<'info, Position>>,
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = collateral_mint, token::authority = owner, token::token_program = collateral_token_program)]
    pub owner_collateral: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub collateral_token_program: Interface<'info, TokenInterface>,
}

// ---------------------------------------------------------------- events and errors

#[event]
pub struct SeriesCreated {
    pub series: Pubkey,
    pub stock_mint: Pubkey,
    pub kind: u8,
    pub strike_e6: u64,
    pub expiry: i64,
}

#[event]
pub struct Written {
    pub series: Pubkey,
    pub owner: Pubkey,
    pub contracts: u64,
    pub collateral: u64,
    pub ask_e6: u64,
}

#[event]
pub struct Bought {
    pub series: Pubkey,
    pub buyer: Pubkey,
    pub writer: Pubkey,
    pub contracts: u64,
    pub premium: u64,
    pub ask_e6: u64,
}

#[event]
pub struct ClosePrice {
    pub series: Pubkey,
    pub share_price_e6: u64,
    pub multiplier_e9: u64,
    pub token_price_e6: u64,
    pub publish_time: i64,
}

#[event]
pub struct Settled {
    pub series: Pubkey,
    pub price_e6: u64,
    pub publish_time: i64,
    pub stale: bool,
    pub voided: bool,
}

#[event]
pub struct Claimed {
    pub series: Pubkey,
    pub owner: Pubkey,
    pub writer: bool,
    pub amount: u64,
}

#[error_code]
pub enum EarnError {
    #[msg("Only the program's upgrade authority can list a stock")]
    NotAdmin,
    #[msg("Series parameters are invalid")]
    BadSeries,
    #[msg("Expiry must be a 16:00 New York close on a weekday")]
    NotAClose,
    #[msg("Writing and buying close 15 minutes before expiry")]
    TradingClosed,
    #[msg("Stablecoin is not allowed or doesn't have 6 decimals")]
    NotAStablecoin,
    #[msg("Amount must be above zero and within what's available")]
    Zero,
    #[msg("A transfer fee reduced the collateral")]
    TransferFee,
    #[msg("Position or payout account doesn't belong to this series")]
    WrongPosition,
    #[msg("No writer had contracts at or under your price")]
    NothingToBuy,
    #[msg("Too early for this step")]
    TooEarly,
    #[msg("Price was published after the close")]
    AfterClose,
    #[msg("No usable closing price yet")]
    NoClosePrice,
    #[msg("Series is already settled")]
    AlreadySettled,
    #[msg("Series is not settled yet")]
    NotSettled,
    #[msg("Arithmetic overflow")]
    Overflow,
}
