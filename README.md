# Rehearsal

**Check the price before you buy a tokenized stock on Solana.**

xStocks and PreStocks trade around the clock on DEX liquidity, and the real share only trades 6.5 hours a day. So the price you're about to pay can be well away from the real stock and nobody tells you. Rehearsal quotes your exact order on Jupiter, reads the fair reference from Solana, and shows the gap in percent and dollars before you sign. If the price is fair, you buy in the same screen.

Built for STOCKLANA (Solana Foundation, Sept 2026). Main track + Pyth + PreStocks bounties.

## What it caught on 24 Sep 2026

| Token | Reference | Your $1,000 fill | Gap |
|---|---|---|---|
| OPENAI (PreStocks) | $1,023 mark | $1,351 | **+32%**, which implies a $1.69T OpenAI vs a $1.27T mark |
| NEURALINK (PreStocks) | $337 mark | $444 | **+32%** |
| SPACEX (PreStocks) | $147 mark | $122 | **−18%**, 4.6% round-trip cost |
| NVDAx | $222.54 Pyth `Equity.US.NVDA` | $222.72 | +0.08% (fair) |

## How it works

1. **Your real fill.** It fetches a live Jupiter quote for the exact size, plus a $10 probe (to separate size impact from spread) and a sell-back quote for round-trip cost.
2. **The fair reference.**
   - xStocks: the Pyth `Equity.US.<TICKER>/USD` price, **read on-chain** from the Pyth push-oracle price account on Solana (`pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT`, shard 1). No Hermes key is needed. Market hours come from the feed's own schedule, so the app can warn when the reference is an after-hours print.
   - PreStocks: the issuer mark and valuation from the PreStocks API. The gap is also shown as an implied company valuation.
3. **Token-2022 Scaled UI Amount.** PreStocks use it for splits (SPACEX is 5×) and xStocks use it to pass through dividends (MCDx 1.021×, STRCx 1.086×). If you ignore the multiplier, raw amounts misprice SPACEX by 5× and add a fake premium to every dividend payer. Rehearsal reads the multiplier from each mint on-chain.
4. **Verdict.** For xStocks (1:1 backed), any gap is pure cost. For PreStocks (SPV-backed, not redeemable at mark on demand), a gap is the market disagreeing with the last valuation, and the app says so plainly.
5. **Execute.** Jupiter builds the swap for the connected wallet. The wallet signs, and the server relays and confirms the transaction on mainnet.

## Run it

```bash
pnpm install
echo "SOLANA_RPC=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY" > .env.local   # optional; public RPC works but rate-limits
pnpm dev
```

`node scripts/build-map.mjs` regenerates `src/data/xstocks.json` (xStock mints → Pyth equity feeds, keeping only feeds with a live on-chain account).

## Code map

- `src/lib/pyth.ts`: PDA derivation and `PriceUpdateV2` decoding for on-chain Pyth accounts
- `src/lib/scaled.ts`: Token-2022 scaled-UI multiplier reader
- `src/lib/market.ts`: Pyth schedule parser (open / pre-market / after hours / weekend / holiday)
- `src/lib/rehearse.ts`: fill, spread, impact, round trip, gap, verdict
- `src/app/api/*`: `board`, `rehearse`, `swap` (Jupiter build), `send` (relay + confirm)

Not investment advice. Quotes move. The app refuses to execute a quote older than 30 seconds.
