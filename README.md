# Rehearsal

**Know what a tokenized stock really costs before you sign, and have the chain refuse the trade if it's worse.**

xStocks and PreStocks trade around the clock on DEX liquidity. The real share trades 6.5 hours a day, and pre-IPO companies don't trade at all. So the price a Solana wallet is about to pay can drift well away from fair value, and nothing on the way to the signature tells you.

Rehearsal has two layers:

1. **Rehearse (off-chain, instant).** It quotes your exact order on Jupiter and prices it against Pyth's on-chain price for the real stock, or against the PreStocks mark. You see the gap in percent and dollars, the size impact, the round-trip cost, and the valuation you're really buying at. Token-2022 scaled-UI multipliers and transfer fees are included.
2. **Guard (on-chain, atomic).** The Rehearsal Guard program wraps any Jupiter swap as `open_guard → swap → close_guard` in one transaction. `close_guard` measures what the wallet actually spent and received and values it at Pyth. If the fill is worse than fair value by more than the wallet's tolerance, the whole transaction reverts. No quote, no off-chain promise, and no stale UI can get around it.

Built for STOCKLANA (Solana Foundation, Sept 2026): Main track, PreStocks bounty, Pyth bounty. Only PreStocks pre-IPO tokens are integrated, per the PreStocks bounty rules.

Live app: https://rehearsal-stocklana.vercel.app

## Blink: the check where traders already are

Any token has a Solana Action at `/api/actions/rehearse/<SYMBOL>`, and `/rehearse/<SYMBOL>` is a shareable link that `actions.json` maps to it. The card image is rendered live (`/api/actions/card/<SYMBOL>`) with the current gap vs fair value. The buttons build a buy for the clicking wallet, re-quoted at click time, with the transfer fee counted in slippage. When the token looks bad, the buttons say "Buy anyway". When the guard is live on the cluster, the Blink's buy runs inside it.

Try it: https://dial.to/?action=solana-action:https://rehearsal-stocklana.vercel.app/api/actions/rehearse/OPENAI

`scripts/fork-blink-test.ts` clicks the Blink like a wallet on the mainnet fork. NVDAx filled inside the guard. OPENAI was blocked on-chain at 39.35% over mark.

## What it found (24 Sep 2026, live mainnet data)

| | Reference | $1,000 fill | Gap |
|---|---|---|---|
| NVDAx | Pyth `Equity.US.NVDA` $222.54 | $222.72 | +0.08%, fair |
| OPENAI (PreStocks) | $1,023 mark | ~$1,400 after the 1% transfer fee | **+38%**, implying a $1.75T OpenAI vs a $1.27T mark |
| SPACEX (PreStocks) | listed SPCXx implies $1.96T | $121 | **19% below the listed share**, with a 6.6% round trip |
| A real $565k PreStocks wallet | | | **$386k SpaceX position with no Jupiter route at full size** |

## Rehearsal Guard program

`onchain/programs/rehearsal_guard` (Anchor 0.32). Program id `TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE`.

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

## Code map

- `onchain/programs/rehearsal_guard/src/`: `lib.rs` (instructions), `oracle.rs` (PriceUpdateV2 validation), `tokens.rs` (Token-2022 TLV, balances), `math.rs` (fixed-point), `state.rs`, `errors.rs`
- `onchain/idl/rehearsal_guard.json`: Anchor IDL
- `src/lib/guard.ts`: client that wraps any Jupiter `/swap-instructions` response with the guard
- `src/lib/rehearse.ts`: fill, spread, impact, round trip, gap, verdict
- `src/lib/wallet.ts`: fair value vs real exit for every position in a wallet
- `src/lib/compare.ts`: same company across listed and pre-IPO tokens, by implied valuation
- `src/app/api/*`: `rehearse`, `board`, `wallet`, `compare`, `swap`, `guarded-swap`, `send`

Not investment advice.
