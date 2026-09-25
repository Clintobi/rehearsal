# Rehearsal

**See Monday's move on Sunday. The real price of every tokenized stock, before you buy, around the clock, with bad fills blocked on-chain.**

xStocks and PreStocks trade around the clock on DEX liquidity. The real share trades 6.5 hours a day, pre-IPO companies don't trade at all, and 63% of Solana tokenized-stock volume happens while US exchanges are closed (Allium, 12 months to 18 Aug 2026). The SEC's new exemption for on-chain stock venues even drops the best-execution rules. So the price a wallet is about to pay can drift far from fair value, and nothing between the quote and the signature says so.

For any tokenized stock, Rehearsal answers four questions before you trade, then enforces the answer:

1. **What you hold.** The legal wrapper (xStocks: a 1:1 collateralised tracker note; PreStocks: SPV exposure, not redeemable at the mark on demand), live proof of reserves from the issuer, and upcoming corporate actions.
2. **How good the price evidence is right now.** A published policy picks the reference by market state: Pyth's on-chain `Equity.US` price in the regular session, the Lighter 24/7 perpetual's mark outside it (Pyth's free on-chain equity feeds are regular-hours only), the PreStocks mark for pre-IPO, and no trade while Nasdaq or the issuer has the stock halted. `GET /api/v1/policy`
3. **Whether you can get out.** Exit capacity: the largest sale within 1%, 2% and 5% of the current price, from a ladder of real Jupiter quotes, next to the biggest wallet's position.
4. **What you paid.** A protected swap whose Jupiter minimum output is set from fair value ± your limit, not from the quote. Jupiter's own program reverts the whole transaction below it, on mainnet, today. The fair price, limit and floor are written into the transaction as a memo, and `/api/v1/certificate?sig=` re-reads the chain and verifies the fill against it.

Underneath: the Rehearsal Guard program (on-chain Pyth checks, LULD-style circuit breakers synced to Nasdaq halts, fair orders with opening and closing crosses), a public execution report with bots removed and a ZK proof verified on Solana, an MCP server for agents, and the Rehearsal Gate transfer hook for Meteora launches priced in stocks.

Built for STOCKLANA (Solana Foundation, Sept 2026): Main track, PreStocks bounty, Pyth bounty, Meteora DBC bounty. Only PreStocks pre-IPO tokens are integrated, per the PreStocks bounty rules.

- Live app: https://rehearsal-stocklana.vercel.app (Trade, Markets, Pre-IPO, Orders, Report)
- For agents: https://rehearsal-stocklana.vercel.app/agents · MCP `https://rehearsal-stocklana.vercel.app/api/mcp` · [OpenAPI](https://rehearsal-stocklana.vercel.app/api/v1/openapi.json) · [skill](skills/rehearsal/SKILL.md)
- Judge walkthrough: [DEMO.md](DEMO.md) · Submission: [docs/SUBMISSION.md](docs/SUBMISSION.md)

## Protected swaps on mainnet

`buildProtectedSwap` (`src/lib/agent.ts`, `POST /api/v1/swap`, MCP `build_protected_swap`) quotes the route, computes the fair-value floor for the wallet's limit (`max_gap_bps`), refuses to build anything if the market is already past it, and otherwise sets Jupiter's `slippageBps` so the on-chain minimum output equals the floor. Token-2022 transfer fees are counted: Jupiter checks what actually lands in the wallet, so a PreStocks buy's floor sits below the pool's quote by the 1% fee.

Tests: 5/5 on a Surfpool mainnet fork (`scripts/fork-protect-test.ts`, output in `docs/fork-protect-test-output.txt`):
- A protected NVDAx buy and sell fill inside their floors, and each receipt verifies against the chain.
- A floor 1% above what the route can deliver reverts inside Jupiter's program (`SlippageToleranceExceeded`, 6001).
- A PreStocks (ANDURIL) buy fills after the 1% transfer fee and verifies.
- A 1% limit on OPENAI, which trades about 32% over its mark, is refused before anything is signed.

The guard program (`open_guard → swap → close_guard`, below) reads Pyth at execution time instead of at build time; it is on devnet until the mainnet deploy.

## Agent layer

The same functions as MCP tools over Streamable HTTP (stateless, no key) at `/api/mcp`: `passport`, `check_trade`, `build_protected_swap`, `verify_receipt`, `market_status` (sessions, halts, breakers, perp prices, cross rules and on-chain official prints), `price_policy`, `prestocks_research`, `execution_report`, `agent_scorecard` (a wallet's sampled fills graded against fair value, with markouts) and `list_stocks`. Every decision is machine-readable: `proceed`, `reduce_size`, `wait` or `avoid`. The mandate is `max_gap_bps`: an agent can't fill past it. Verified with the official MCP inspector (`tools/list`, `tools/call`). Install the skill with `npx skills add Clintobi/rehearsal`.

## Rehearsal Gate: Meteora launches that stop when the stock stops

`onchain/programs/rehearsal_gate` (program `4MtrgDQpbgjpzcAcL5Ftm8E1L37deBnZ5f2Pi6WmpqPE`) is a Token-2022 transfer hook for Meteora DBC launches quoted in a tokenized stock. `init_gate` binds the launch mint to the quote stock's Rehearsal circuit breaker, in the same transaction that creates the pool so the binding can't be front-run. On every transfer during the bonding curve the hook refuses while the stock is halted on its primary exchange (the halt relayer mirrors Nasdaq's halt feed on-chain) or its breaker has paused trading. DBC removes the hook when the curve completes, so the graduated pool trades freely. It mirrors the rule that listed markets and the SEC's tokenized-venue exemption follow; it is not a compliance claim.

Tests: 8/8 on a Surfpool mainnet fork against Meteora's real DBC program and the real SPYx token badge (`scripts/fork-gate-test.ts`, output in `docs/fork-gate-test-output.txt`): a launch quoted in SPYx fills; while SPY is halted, buys and sells revert in the gate (6000 `ExchangeHalted`); after the halt lifts they fill again; completing the curve removes the hook. Live on devnet: a DBC pool gated by the NVDA breaker the relayer keeps in sync (`docs/devnet-gate-output.txt`).

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

Every report update publishes the exact graded-fill dataset (`fills.json`, one row per fill with its transaction signature) and writes the dataset's SHA-256 to Solana devnet in a memo transaction. `node zk/verify-offchain.mjs fills.json` recomputes every committed number from the raw fills, using the same integer math as the ZK program.

`zk/` holds an SP1 program that recomputes the report from raw fills. It commits sha256(dataset), counts, medians, p90s and within-25-bps shares.

**ZK-verified on Solana.** The Groth16 proof over the 310-fill snapshot (`zk/proof/`, generated on a GitHub Actions runner by `.github/workflows/zk-proof.yml`) is verified on-chain by the program's `attest_report` instruction ([tx](https://explorer.solana.com/tx/xWLNrsazKgyC2xADjP3nUACbvqzTYTBrfdDvPtAYtZTtvFH8UWGZkyEHBw4kjqEqfyriJcgRBrteJLfqAkNsJQk?cluster=devnet), attestation `CjtFcKbRrHyBtmdSf1FagcJMzq1EYnnu5rFNdgyGrodH`). It rebuilds SP1 v6's five public inputs (program vkey hash, masked sha256 of the public values, exit code, recursion vk root, nonce) and runs the pairing check with Solana's alt_bn128 syscalls, in 110,458 compute units, then stores a `ReportAttestation` with the proven numbers. The same proof submitted with a different dataset hash is rejected with `ProofInvalid`. See `docs/zk-onchain-output.txt`. `zk/solana-convert` converts SP1's gnark proof and key into the syscall format and verifies off-chain first.

**Bots excluded.** Wallets that buy and sell the same token at least 5 times each and end within 10% of flat are round-tripping, not investing (the wash-trading signature from the DN Institute's study of Solana xStock pools). Their fills are dropped from every statistic and from the published dataset: 207 fills from 5 wallet/token pairs at the time of writing. The bot-free dataset (`zk/data/fills-botfree.json`, 903 graded fills, sha256 `d16b791f…`) is committed on devnet and passes the SP1 `--execute` check. Its Groth16 proof needs more memory than a free GitHub runner has (two attempts were cut off while proving), so the proof verified on-chain is still the one over the 310-fill snapshot in `zk/data/fills.json`.

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
