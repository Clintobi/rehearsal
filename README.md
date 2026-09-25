# Rehearsal

**Know what a tokenized stock really costs before you sign, and have the chain refuse the trade if it's worse.**

xStocks and PreStocks trade around the clock on DEX liquidity. The real share trades 6.5 hours a day, and pre-IPO companies don't trade at all. So the price a Solana wallet is about to pay can drift well away from fair value, and nothing on the way to the signature tells you.

Rehearsal has two layers:

1. **Rehearse (off-chain, instant).** It quotes your exact order on Jupiter and prices it against Pyth's on-chain price for the real stock, or against the PreStocks mark. You see the gap in percent and dollars, the size impact, the round-trip cost, and the valuation you're really buying at. Token-2022 scaled-UI multipliers and transfer fees are included.
2. **Guard (on-chain, atomic).** The Rehearsal Guard program wraps any Jupiter swap as `open_guard → swap → close_guard` in one transaction. `close_guard` measures what the wallet actually spent and received and values it at Pyth. If the fill is worse than fair value by more than the wallet's tolerance, the whole transaction reverts. No quote, no off-chain promise, and no stale UI can get around it.

Built for STOCKLANA (Solana Foundation, Sept 2026): Main track, PreStocks bounty, Pyth bounty. Only PreStocks pre-IPO tokens are integrated, per the PreStocks bounty rules.

Live app: https://rehearsal-stocklana.vercel.app

Judge walkthrough (check, protect, prove): [DEMO.md](DEMO.md)

## Open execution report: a Rule 605 for tokenized stocks

On 17 Sep 2026 the SEC exempted on-chain AMM venues for tokenized stocks from Rules 605, 610, 611, 612 and 613, and imposed no best-execution standard (Rel. 34-106402). Rule 605 is the rule that makes US brokers publish how well they fill customer orders. Rehearsal publishes the equivalent for Solana, in the open: https://rehearsal-stocklana.vercel.app/report

`scripts/recorder.ts` works in five loops:
- Every 3s it records the Pyth equity price accounts.
- Every 30s it randomly samples successful transactions on every xStock and PreStocks mint, then parses each into a fill: trader, side, fill price net of Token-2022 fees and multipliers, venue and router.
- It grades each fill against the reference at that second: Pyth, the xStocks issuer reference, or the PreStocks mark.
- It computes 5-minute markouts.
- Every 10 minutes it publishes a report (by venue, router, size, session and token, plus the worst fills) to a public gist that the page reads live.

The method, sampling and exclusions are on the page. Pyth is a reference price, not the legal NBBO.

## Circuit breaker with halt-sync

The same program now has a per-feed `Breaker` modelled on the US Limit Up-Limit Down plan:
- It keeps a rolling ~5-minute Pyth reference and a band around it (5% for Tier 1).
- It enters a limit state when the price leaves the band, pauses for 5 minutes if it stays out 15s, then reopens at the current price.
- `set_halt` mirrors primary-exchange halts, which the SEC exemption requires. `scripts/halt-relayer.ts` posts them from Nasdaq Trader's official halt feed.
- `close_guard` refuses trades while the breaker is limited, paused, halted or stale.
- `check_breaker` lets any venue enforce the same rule with one CPI.

Tests:
- 13/13 on a clean Surfpool mainnet fork with the real NVDA Pyth account and real Jupiter routes (`scripts/fork-breaker-test.ts`, output in `docs/fork-breaker-test-output.txt`). Covered: an 8% shock → limit → pause → reopen, halt → blocked, a stranger can't lift a halt, stale → blocked.
- 11/11 live on devnet (`docs/devnet-smoke-output.txt`), cranking devnet's real Pyth SOL/USD account.
- 4 state-machine unit tests.

Breakers for the 11 Pyth-referenced stocks are live on devnet.

## Fair orders and the Monday-open cross

- **Fair orders** (`place_order` / `fill_order` / `cancel_order`): an order's limit is Pyth fair value plus the owner's `max_gap_bps`, not a number the owner typed. The input sits in a program-owned escrow. Any market maker can fill part or all of it. The program measures what the owner actually received (after Token-2022 transfer fees and the scaled-UI multiplier) and rejects any fill worse than the limit. Price improvement goes to the owner, and each fill emits its gap vs Pyth.
- **Opening cross** (`crank_cross` / `cross_orders`): orders placed with `at_open` can't be filled directly while the market is closed. `crank_cross` is permissionless and records the Pyth publish time. When the feed resumes after at least 30 minutes of silence (a weekend, a holiday), it snapshots that reopen print as the cross price and opens a 5-minute window. `cross_orders` matches any waiting buyer and seller at exactly that price.
- **Closing cross** (`crank_close` / `cross_at_close`): orders placed with `at_close` fill at the official 4:00 PM New York close, the price index funds trade at. The program computes the session close on-chain from the unix clock, including US daylight saving (`nyclock.rs`; weekends have no session, holidays are not modelled). `crank_close` is permissionless and keeps the latest Pyth print published at or before the bell, so an after-hours print can't move it. `cross_at_close` runs from 16:00 to 16:05, needs a closing print no more than 120 s old at the bell, and only matches orders created before the close.
- **Discovery bounds for the guard** (`Policy.drift_bps_per_hour`): the tolerance widens with the age of the Pyth price, capped at 50%. A weekend trade isn't judged against Friday's close as if it were live, and it isn't waved through either. The same idea as trade.xyz's off-hours bounds, applied to spot swaps.

Tests: 17/17 on a Surfpool mainnet fork (`scripts/fork-orders-test.ts`, output in `docs/fork-orders-test-output.txt`):
- A fill at 0.2% over fair is accepted and one at 2% over is rejected. A better quote fills 0.09% under fair.
- At-open orders can't be picked off over the weekend.
- A crank during the close doesn't open a cross, and the first print after 3 hours opens one.
- A buyer and seller cross at $231.2865, equal to the cross price to the cent. The window closes after 5 minutes, and cancel returns the rest.
- A stale oracle with a fixed 1% tolerance blocks a trade that discovery bounds correctly allow.

Closing cross: 12/12 on the fork (`scripts/fork-close-test.ts`, output in `docs/fork-close-test-output.txt`). The 15:59:55 print sets the close. An after-hours print 2% higher doesn't change it. An order placed at 16:00:10 can't join. A buyer and seller cross at an implied $225.5432, the closing price exactly. On devnet, `crank_close` put today's session close at 20:00 UTC, which is 16:00 EDT.

## Verifiable report

Every report update publishes the exact graded-fill dataset (`fills.json`, one row per fill with its transaction signature) and writes the dataset's SHA-256 to Solana devnet in a memo transaction. `node zk/verify-offchain.mjs fills.json` recomputes every committed number from the raw fills, using the same integer math as the SP1 program.

`zk/` holds an SP1 program that recomputes the report from raw fills. It commits sha256(dataset), counts, medians, p90s and within-25-bps shares.

**What prove means for this submission.** The live grades on `/report`, plus the SP1 `--execute` check, which already passed. From `zk/script`, `cargo run --release -- --execute` prints the public values in [DEMO.md](DEMO.md). That is the check. It is not a Groth16 proof, and it is not a Succinct Prover Network proof.

**Later, not this submission.** Local Groth16 (Docker, after submit) and the Succinct Prover Network (when the requester account has PROVE credits) are the optional next step. The program has an `attest_report` instruction for that later proof. See [zk/README.md](zk/README.md).

## Blink: the check where traders already are

Any token has a Solana Action at `/api/actions/rehearse/<SYMBOL>`, and `/rehearse/<SYMBOL>` is a shareable link that `actions.json` maps to it. The card image is rendered live (`/api/actions/card/<SYMBOL>`) with the current gap vs fair value. The buttons build a buy for the clicking wallet, re-quoted at click time, with the transfer fee counted in slippage. When the token looks bad, the buttons say "Buy anyway". When the guard is live on the cluster, the Blink's buy runs inside it.

The Action is live: https://rehearsal-stocklana.vercel.app/api/actions/rehearse/OPENAI

The dial.to public registry listing was blocked (`DEPLOYMENT_PAUSED`, HTTP 503). Email has already been sent to Dialect. There is no public registry listing.

`scripts/fork-blink-test.ts` clicks the Blink like a wallet on the mainnet fork. NVDAx filled inside the guard. OPENAI was blocked on-chain at 39.35% over mark.

## What it found (24 Sep 2026, live mainnet data)

| | Reference | $1,000 fill | Gap |
|---|---|---|---|
| NVDAx | Pyth `Equity.US.NVDA` $222.54 | $222.72 | +0.08%, fair |
| OPENAI (PreStocks) | $1,023 mark | ~$1,400 after the 1% transfer fee | **+38%**, implying a $1.75T OpenAI vs a $1.27T mark |
| SPACEX (PreStocks) | listed SPCXx implies $1.96T | $121 | **19% below the listed share**, with a 6.6% round trip |
| A real $565k PreStocks wallet | | | **$386k SpaceX position with no Jupiter route at full size** |

## Rehearsal Guard program

`onchain/programs/rehearsal_guard` (Anchor 0.32). Program id `TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE`, **deployed on devnet** ([explorer](https://explorer.solana.com/address/TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE?cluster=devnet)). Devnet has no Jupiter or xStocks, so `scripts/devnet-smoke.ts` checks the deployed program's own rules there (a guard with no close, a close with no swap, an out-of-range tolerance: 3/3, links in `docs/devnet-smoke-output.txt`). The full swap path is tested on a mainnet fork, below. Mainnet deploy is the same binary.

**`open_guard(policy)`**
- Snapshots the wallet's input and output token balances into a transaction-scoped PDA. The output account may not exist yet, since Jupiter creates it inside the swap.
- Uses the instructions sysvar to require a matching `close_guard` later in the same transaction. A guard can't be left open.
- The policy sets:
  - the side (buy or sell against USDC, USDT or PYUSD)
  - the reference: a Pyth feed, with max age and max confidence width, or a limit price (used for PreStocks, from the issuer mark)
  - a tolerance in bps

**`close_guard()`**
- Computes the amounts actually spent and received from the balance deltas.
- Reads the stock mint's Token-2022 **Scaled UI Amount** multiplier from the mint's extension data (TLV type 25), including a scheduled new multiplier. SPACEX is 5× after the split, and xStocks pass dividends through this way.
- Validates the Pyth `PriceUpdateV2` account by owner (Pyth receiver), discriminator, full verification, feed id, age and confidence width. It's decoded by hand, with no SDK version pinning.
- Reverts with `FillWorseThanFair` if the gap exceeds the tolerance.
- Otherwise it emits a `GuardedFill` event (fill price, reference, gap bps, multiplier) and updates a per-wallet `Ledger` PDA (fills, volume, cumulative edge vs fair) and a global `Stats` PDA.

**Why on-chain:** the quote a UI shows and the fill a wallet gets are two different things. The only place both the fair price and the actual fill are known at once is inside the transaction.

### Tests: 9/9 on a Surfpool mainnet fork

Real Jupiter routes, real Pyth accounts, real xStock and PreStocks mints. `scripts/fork-test.ts`, output in `docs/fork-test-output.txt`.

```
PASS  1. Buy $500 NVDAx, Pyth guard 1%: passes           fill $223.65 vs Pyth $223.59, gap 2 bps
PASS  2. Buy with a fair price 20% below Pyth: reverts   2434 bps worse, tolerance 100
PASS  3. Spoofed oracle (AAPL account for NVDA feed)     Pyth feed mismatch
PASS  4. Fake oracle account                             Not a Pyth price account
PASS  5. Sell 1 NVDAx, Pyth guard 1%: passes             gap 5 bps
PASS  6. OPENAI PreStocks capped at mark +5%: reverts    3448 bps worse
PASS  7. SPACEX PreStocks capped at mark: passes         5x multiplier applied, 1807 bps better than mark
PASS  8. open_guard without close_guard: reverts
PASS  9. Ledger PDA records exactly the 3 guarded fills
```

`scripts/fork-app-test.ts` drives the app's own `/api/rehearse → /api/guarded-swap` path with a signing wallet. The app predicted OPENAI +39.20% over mark before the trade, and the guard measured +39.35% on-chain and blocked it.

Unit tests (`cargo test`) cover scaled-amount, value, price and gap math.

## Details that are easy to get wrong

- **Scaled UI Amount.** Ignore it and SPACEX looks 5× too expensive, and every dividend-paying xStock shows a fake premium.
- **Transfer fees.** PreStocks withhold 1% on every transfer, pool-to-buyer included. A buyer receives 1% less than Jupiter's `outAmount`, so a 1% slippage setting can never fill. Rehearsal counts the fee in every fill and sizes slippage around it.
- **Pyth Hermes has needed an API key since 2026-08-26.** Rehearsal reads the sponsored push-feed accounts on Solana directly (shard 1), with no key.
- **Market hours.** The Pyth feed's own schedule tells the app when the reference is an after-hours print.

## Run it

```bash
pnpm install
echo "SOLANA_RPC=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY" > .env.local
pnpm dev

# program
cd onchain && cargo test && cargo build-sbf --manifest-path programs/rehearsal_guard/Cargo.toml --sbf-out-dir target/deploy

# fork test
surfpool start -u <mainnet rpc> --no-tui --no-deploy --no-studio
solana program deploy onchain/target/deploy/rehearsal_guard.so --program-id <keypair> -u http://127.0.0.1:8899
npx tsx scripts/fork-test.ts
```

## Program instructions (devnet `TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE`)

| Instruction | What it does |
|---|---|
| `open_guard` / `close_guard` | Wrap any swap; revert if the fill is worse than Pyth or a limit, beyond tolerance and discovery bounds |
| `init_breaker` / `crank_breaker` / `set_halt` / `check_breaker` | LULD-style circuit breaker plus primary-exchange halt-sync |
| `place_order` / `fill_order` / `cancel_order` | Fair orders: limit = fair value; market makers compete; price improvement goes to the owner |
| `crank_cross` / `cross_orders` | Opening cross: weekend orders clear together at the reopen print |
| `crank_close` / `cross_at_close` | Closing cross: at-close orders clear at the 4:00 PM New York price |

## Code map

- `onchain/programs/rehearsal_guard/src/`: `lib.rs` (instructions), `oracle.rs` (PriceUpdateV2 validation), `tokens.rs` (Token-2022 TLV, balances), `math.rs` (fixed-point), `state.rs`, `errors.rs`
- `onchain/idl/rehearsal_guard.json`: Anchor IDL
- `src/lib/guard.ts`: client that wraps any Jupiter `/swap-instructions` response with the guard
- `src/lib/rehearse.ts`: fill, spread, impact, round trip, gap, verdict
- `src/lib/wallet.ts`: fair value vs real exit for every position in a wallet
- `src/lib/compare.ts`: same company across listed and pre-IPO tokens, by implied valuation
- `src/app/api/*`: `rehearse`, `board`, `wallet`, `compare`, `swap`, `guarded-swap`, `send`

Not investment advice.
