//! Shared circuit breaker per Pyth feed, modelled on the US Limit Up-Limit Down plan:
//! a rolling ~5-minute reference, a band around it, a limit state when the price leaves
//! the band, a trading pause if it stays out, and a reopen. Exchange halts (the one hard
//! condition of the SEC's 2026 exemption for on-chain stock venues) are posted by the
//! breaker's authority from the primary exchange's halt feed.
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum BreakerState {
    Normal,
    /// Price is outside the band; trading pauses if it stays out for `limit_secs`.
    Limit,
    /// Trading paused until `paused_until`, then reopens against a fresh reference.
    Paused,
}

#[account]
#[derive(InitSpace)]
pub struct Breaker {
    pub feed_id: [u8; 32],
    pub authority: Pubkey,
    /// Band around the rolling reference: 500 = 5% (LULD Tier 1), 1000 = 10% (Tier 2).
    pub band_bps: u16,
    pub limit_secs: u32,
    pub pause_secs: u32,
    pub max_age_secs: u32,
    /// Time constant of the rolling reference, seconds (300 ≈ the LULD 5-minute average).
    pub window_secs: u32,
    pub reference_e6: u64,
    pub last_price_e6: u64,
    pub last_publish: i64,
    pub last_crank: i64,
    pub state: BreakerState,
    pub state_since: i64,
    pub paused_until: i64,
    pub exchange_halted: bool,
    /// Primary-exchange reason code, e.g. "LUDP", "T1", "M".
    pub halt_reason: [u8; 4],
    pub halt_since: i64,
    pub trips: u32,
    pub bump: u8,
}

pub struct Step {
    pub reference_e6: u64,
    pub state: BreakerState,
    pub state_since: i64,
    pub paused_until: i64,
    pub tripped: bool,
    pub deviation_bps: u64,
}

/// Pure state transition, so it can be unit-tested without a validator.
/// `price_e6` is the latest oracle price, `dt` the seconds since the previous one.
#[allow(clippy::too_many_arguments)]
pub fn step(
    reference_e6: u64,
    state: BreakerState,
    state_since: i64,
    paused_until: i64,
    price_e6: u64,
    dt: i64,
    now: i64,
    band_bps: u16,
    limit_secs: u32,
    pause_secs: u32,
    window_secs: u32,
) -> Step {
    // Rolling reference: exponential average with a `window_secs` time constant.
    let mut reference = if reference_e6 == 0 {
        price_e6
    } else {
        let w = dt.clamp(0, window_secs as i64) as i128;
        let r = reference_e6 as i128;
        (r + (price_e6 as i128 - r) * w / window_secs.max(1) as i128) as u64
    };
    let dev = if reference == 0 {
        0
    } else {
        (price_e6.abs_diff(reference) as u128 * 10_000 / reference as u128) as u64
    };
    let outside = dev > band_bps as u64;

    let (mut st, mut since, mut until, mut tripped) = (state, state_since, paused_until, false);
    match state {
        BreakerState::Paused if now >= paused_until => {
            // Reopen against the current price, like a reopening auction print.
            st = BreakerState::Normal;
            since = now;
            reference = price_e6;
        }
        BreakerState::Paused => {}
        BreakerState::Normal if outside => {
            st = BreakerState::Limit;
            since = now;
        }
        BreakerState::Normal => {}
        BreakerState::Limit if !outside => {
            st = BreakerState::Normal;
            since = now;
        }
        BreakerState::Limit if now - state_since >= limit_secs as i64 => {
            st = BreakerState::Paused;
            since = now;
            until = now + pause_secs as i64;
            tripped = true;
        }
        BreakerState::Limit => {}
    }
    Step { reference_e6: reference, state: st, state_since: since, paused_until: until, tripped, deviation_bps: dev }
}

#[event]
pub struct BreakerChanged {
    pub feed_id: [u8; 32],
    pub state: BreakerState,
    pub exchange_halted: bool,
    pub halt_reason: [u8; 4],
    pub price_e6: u64,
    pub reference_e6: u64,
    pub deviation_bps: u64,
    pub at: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    const B: u16 = 500;

    fn s(r: u64, st: BreakerState, since: i64, until: i64, p: u64, dt: i64, now: i64) -> Step {
        step(r, st, since, until, p, dt, now, B, 15, 300, 300)
    }

    #[test]
    fn seeds_reference_and_stays_normal_inside_band() {
        let x = s(0, BreakerState::Normal, 0, 0, 100_000_000, 0, 10);
        assert_eq!(x.reference_e6, 100_000_000);
        let y = s(x.reference_e6, BreakerState::Normal, 0, 0, 103_000_000, 15, 25);
        assert_eq!(y.state, BreakerState::Normal);
    }

    #[test]
    fn limit_then_pause_then_reopen() {
        // +8% jump: outside a 5% band
        let a = s(100_000_000, BreakerState::Normal, 0, 0, 108_000_000, 1, 100);
        assert_eq!(a.state, BreakerState::Limit);
        // still out after 15s: pause for 300s
        let b = s(a.reference_e6, a.state, a.state_since, 0, 108_000_000, 15, 115);
        assert_eq!(b.state, BreakerState::Paused);
        assert!(b.tripped);
        assert_eq!(b.paused_until, 415);
        // before the pause ends nothing changes
        let c = s(b.reference_e6, b.state, b.state_since, b.paused_until, 108_000_000, 100, 300);
        assert_eq!(c.state, BreakerState::Paused);
        // reopen against the current price
        let d = s(c.reference_e6, c.state, c.state_since, c.paused_until, 108_000_000, 115, 415);
        assert_eq!(d.state, BreakerState::Normal);
        assert_eq!(d.reference_e6, 108_000_000);
    }

    #[test]
    fn limit_clears_when_price_returns() {
        let a = s(100_000_000, BreakerState::Normal, 0, 0, 107_000_000, 1, 100);
        assert_eq!(a.state, BreakerState::Limit);
        let b = s(a.reference_e6, a.state, a.state_since, 0, 101_000_000, 5, 105);
        assert_eq!(b.state, BreakerState::Normal);
    }

    #[test]
    fn slow_drift_moves_the_reference_and_does_not_trip() {
        // 1% every 60s for 10 minutes: the reference follows, deviation stays inside 5%
        let mut r = 100_000_000u64;
        let mut p = 100_000_000u64;
        let mut st = BreakerState::Normal;
        for i in 1..=10 {
            p = p * 101 / 100;
            let x = s(r, st, 0, 0, p, 60, i * 60);
            r = x.reference_e6;
            st = x.state;
        }
        assert_eq!(st, BreakerState::Normal);
    }
}
