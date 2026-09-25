# Stock Earn on Solana: plan (draft)

Direction proposed 25 Sep 2026. Not final. Research behind it: `docs/research/2026-09-25/`.

## The product

1. **Weekly earn (dual investment)** on NVDAx, TSLAx, SPYx.
   - USDC depositors sell cash-secured puts; stock holders sell covered calls.
   - Expiry every Friday at 4 PM New York time.
2. **Later:**
   - Peer-to-peer autocallable notes: one side buys yield, the other buys protection. The coupon is set by the ratio of deposits, and there are no liquidations.
   - Principal-protected notes for stablecoin savers.
   - An Earn API for wallets and issuers.

## Decided

### Settlement price

**At launch:** settle on the Pyth price the guard program records at 4 PM (`crank_close` / `ClosingCross`).
- Fix before settling anything on it: accept only a Pyth update published in the last few seconds before 16:00. Today `crank_close` keeps any update published at or before 16:00, up to 3600 s old (`read_pyth(..., 3600, ...)` in `onchain/programs/rehearsal_guard/src/orders.rs`).
- Tell market makers the settlement source up front.

**Once a market maker joins**, both sources are available:
- Keepers or market-maker signers (for example 2 of 3) post the official close.
- The program accepts it only within ±25 bps of the Pyth snapshot, then waits one hour for challenges.
- If the official close is challenged or missing, settlement falls back to the Pyth snapshot.
- Needs a licensed data source, because posting exchange prices on-chain is redistribution.

**Still to ask:** Chainlink and Pyth, whether either publishes the closing-auction price. Neither's docs had an official-close field on 25 Sep:
- Chainlink v11 has `mid`, `bid`, `ask`, `lastTradedPrice` and `marketStatus`.
- Pyth's free Equity.US feeds stop at 16:00.

**Why the Pyth snapshot is good enough to start.** I compared the last price before 16:00 with the official close.
- Sample: 12 stocks, 264 stock-days, 25 Aug to 24 Sep 2026.
- Gap: median 1.1 bps, p90 4.6 bps, worst 16.6 bps. SPY and QQQ never exceeded 1.4 bps.
- Several of the biggest gaps fell on month-end (31 Aug) and the quarterly expiry (18 Sep).
- This is a proxy: Yahoo 2-minute bars, because Pyth's history API needs a key. The script and data are `docs/research/2026-09-25/close-gap.py` and `close-gap.json`.
- It only matters when a stock closes within about 0.2% of a strike.

## What already exists (don't pitch it as new)

**Stock products on exchanges:**
- Bybit dual asset on xStocks.
- Bitget fixed-coupon notes on stock tokens.
- Bybit 24/7 options on stock perps, since 17 Sep 2026.

**Robinhood Chain:**
- Note Systems autocallables, on testnet with mainnet due after an audit.
- Vanilla stock options, according to Note Systems' docs. Which protocol runs them is unverified.

**Solana:**
- Options protocols are dead or dormant: Friktion $0, PsyOptions $0.6M, Dual Finance $0.26M, Cega $0.3M.
- Kraken's xStocks vaults, launched 14 Sep, earn about 2% from lending only.

**Crypto-only options elsewhere:** Derive ($190M), Rysk ($30M), Aevo.

**What's new here is the position: the first stock options and notes on Solana. The mechanism itself is not new.**

## Kill test

Within 60 days of launch: one market maker quoting weekly on 3 names, and $1M from at least 200 wallets. If that doesn't happen, switch to the peer-to-peer notes or stop.

## Open

- **Market makers:** candidates are the JupiterZ and xStocks xChange market makers, plus intros from the Solana Foundation capital-markets desk.
- **Before public deposits:**
  - Audit.
  - Legal wrapper: an offshore entity, blocking US users, and reaching Nigeria only through licensed partners (ISA 2025).
  - A multisig with 2 to 3 co-signers.
- **Competition:** Note Systems could deploy on Solana. The alternative is to partner with them.
