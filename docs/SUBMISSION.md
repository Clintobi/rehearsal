# STOCKLANA submission: Rehearsal

**Tracks:** Main track, PreStocks bounty, Pyth bounty. Only PreStocks pre-IPO tokens are integrated.

**Links**
- Live app: https://rehearsal-stocklana.vercel.app
- Open execution report: https://rehearsal-stocklana.vercel.app/report
- Code: https://github.com/Clintobi/rehearsal
- Program (devnet): TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE
- Blink: https://dial.to/?action=solana-action:https://rehearsal-stocklana.vercel.app/api/actions/rehearse/OPENAI

## One line
Best execution for tokenized stocks on Solana: a public report card for every fill, an on-chain guard and circuit breaker, and fair orders that don't let the weekend set your price.

## The problem
On 17 Sep 2026 the SEC exempted on-chain venues for tokenized stocks from Rules 605 and 611, and set no best-execution standard (Rel. 34-106402). Its own Investor Advisory Committee had warned that retail "may purchase or sell stock … at a worse price than is otherwise publicly available." Tokenized stocks trade 24/7 on thin pools, and the real share trades 6.5 hours a day. Nobody on-chain tells a trader whether the fill was fair, and nobody stops one that isn't.

## What we built
1. **Open execution report.** It samples real xStock and PreStocks fills on mainnet and grades each against Pyth's price for the real share at that second, or the PreStocks mark. It publishes medians, the worst decile, and 5-minute markouts by venue, router, size and session. The dataset is published and its SHA-256 is committed on Solana each update. An SP1 program (in `zk/`) recomputes the report from raw fills, ready for a ZK proof on a 16 GB+ prover.
2. **Rehearsal Guard program.** It wraps any Jupiter swap in one transaction. It measures the actual fill and values it at Pyth, validating the account's owner, feed, verification level, age and confidence. It applies Token-2022 scaled-UI multipliers read from the mint, and reverts if the fill is beyond tolerance. Tolerance can widen with oracle age, like off-hours discovery bounds.
3. **Circuit breaker with halt-sync.** LULD-style bands around a rolling Pyth reference, with limit, pause and reopen. Primary-exchange halts are mirrored on-chain from Nasdaq's official halt feed, which is the SEC exemption's one hard condition. Any venue can enforce it with one CPI.
4. **Fair orders and the opening cross.** Resting orders whose limit is fair value. Market makers compete to fill, only at or better than fair, and price improvement goes to the trader. Orders placed while the market is closed clear together at the first Pyth print after reopen, at one price.
5. **Pre-trade check, wallet exit check and Blink.** The real fill vs fair value before signing, including PreStocks' 1% transfer fee and SpaceX's 5× split. What a wallet's positions would really pay out right now: we found a $386k SPACEX position with no on-chain exit at full size. A tweetable card with the live verdict.

## Why Solana
Pyth equity prices are readable on-chain with no API key, so the fair price and the actual fill meet inside one atomic transaction. Token-2022 carries the corporate actions. Solana holds about 95% of on-chain tokenized-equity volume.

## Evidence
- Mainnet fork (Surfpool, real Jupiter routes, Pyth accounts and mints): guard 9/9, breaker 13/13, fair orders and cross 17/17. The app's pre-trade estimate (+39.20%) matched the guard's on-chain measurement (+39.35%).
- Devnet: 10/10 against the deployed program, with explorer links in `docs/devnet-smoke-output.txt`. Breakers for 11 stocks are live, with the halt relayer running.
- 10 Rust unit tests (fixed-point math, cross quantities, breaker state machine).
- Live data: `/report`.

## PreStocks-specific
- Handles the 1% transfer fee (buys fill below the quote, so slippage must allow for it) and the 5× SPACEX multiplier.
- Compares SPACEX to the listed SPCXx: the pre-IPO token trades about 19–22% under the listed share.
- Grades PreStocks fills against the mark, and says plainly that this measures valuation distance, not fill quality.
- The wallet exit check shows how much of a position can actually leave.

## Honest limits
- The guard, breaker and orders are on devnet. The mainnet deploy needs about 3.5 SOL.
- Pyth is a reference price, not the legal NBBO.
- Off-hours references are the latest print. Pyth's 24/7 feeds need a Pyth Pro key.
- The ZK proof hasn't been generated: the Groth16 step needs 16 GB+ RAM. The program and expected outputs are in `zk/`.
