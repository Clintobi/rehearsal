# Earn: market maker outreach (drafts, 25 Sep 2026)

Goal: one desk willing to quote weekly NVDAx / TSLAx / SPYx calls and puts. Kill test in `docs/earn-plan.md`.

## One-pager (for anyone who asks "what is it")

Rehearsal Earn: weekly covered calls and cash-secured puts on tokenized stocks, on Solana.

- Underlyings: NVDAx, TSLAx, SPYx (xStocks), more once there's demand.
- Writers escrow the full collateral: the stock for a call, USDC for a put. No leverage, no liquidations, no counterparty risk for the buyer.
- Each writer sets their own premium. A buyer takes any writer's ask in one instruction and the premium goes straight to the writer.
- Expiry: Fridays, 16:00 New York. Settlement: the last Pyth price published at or before 16:00, fixed at 16:15 (anyone can post a later pre-close print until then). Calls pay out in the stock, puts in USDC.
- Hedging: the same weeklies trade on US exchanges during market hours, and on Bybit (options on stock perps) since 17 Sep 2026.
- Status: program tested end to end on a mainnet fork (31/31) with the real mints and Pyth accounts. Not audited. No mainnet deposits before an audit.
- Ask: indicative weekly bids for 3-5% out-of-the-money puts and calls on NVDA, TSLA and SPY, $50k-$500k notional a week to start.

## Targets, in order

| # | Who | Why | Channel | Verified |
|---|---|---|---|---|
| 1 | Thetanuts | V4 is "builder-first, RFQ-powered options infrastructure" with makers attached. EVM only today (Base, Ethereum, Arbitrum). | X / Discord | Docs + SDK read 25 Sep |
| 2 | Solana Foundation capital markets desk | Knows which makers quote xStocks; can intro | X (@capitalmarkets) | Their 850K-holders post, from your research list |
| 3 | xStocks / Kraken vault team | Their vault pays 2% (SPYx) / 1.8% (NVDAx); covered calls would pay more; their xChange RFQ makers already quote xStocks | X | genfinity.io, 14 Sep |
| 4 | Rysk | RFQ covered calls with live makers ($30M, HyperEVM + Ethereum), crypto only | X | Docs + DefiLlama, 25 Sep |
| 5 | Note Systems (optional) | Autocallables on tokenized stocks, Robinhood Chain. Partner rather than compete? | X | Your own article, 24 Sep |

Direct desks (Wintermute, GSR, Flowdesk, QCP, Orbit and others) are better reached through #2 and #3: I have no verified contacts.

## Messages

One line per paragraph so they paste cleanly.

### 1. Thetanuts (email or DM)

Subject: Stock options on Solana, off your RFQ?

```
Hi, I'm Clinton, a med student who builds on Solana. Your V4 docs call it "builder-first, RFQ-powered options infrastructure", which is exactly the piece I'm missing.

I built weekly covered calls and cash-secured puts on tokenized stocks on Solana (NVDAx, TSLAx, SPYx). Writers escrow the full collateral, so buyers carry no counterparty risk, and it settles on the last Pyth price before the 4 PM New York close. It passes end-to-end tests on a mainnet fork. It isn't audited or live yet, and I know V4 runs on EVM today.

What's missing is the buy side. The same weeklies trade on US exchanges, and on Bybit since the 17th, so your makers could hedge them.

One thing I can't tell from the outside: would your makers quote off a Pyth 4 PM print, or would they need the exchange's official close before they'd touch it? That decides how I build settlement.

Best,
Clinton Obi
```

### 2. Solana Foundation capital markets desk (X DM)

```
Hi, saw your post on 850K tokenized-stock holders on Solana. I built weekly covered calls and cash-secured puts on xStocks, settling on the last Pyth price before the 4 PM close. For comparison, Kraken's own xStocks vault pays about 2% on the same tokens. Tested end to end on a mainnet fork, audit next. The missing piece is makers who'll quote weekly stock options. Of the desks quoting xStocks on JupiterZ, do you know if any also run an options book?
```

### 3. xStocks / Kraken vault team (X DM)

```
Hi, your xStocks vaults launched at 2% on SPYx and 1.8% on NVDAx. I built weekly covered calls on the same tokens on Solana, fully collateralized and settling on the 4 PM Pyth print. At typical volatility a 3-5% out-of-the-money weekly call has been worth several times that (my estimate, not live yet). Before I go to audit: would a covered-call leg fit inside your vault setup, or would it have to live as its own product?
```

### 4. Rysk (X DM)

```
Hi, Rysk shows RFQ covered calls can work on-chain. I built the same shape for tokenized stocks on Solana (NVDAx, TSLAx, SPYx), fully collateralized, settling on the last Pyth price before the 4 PM New York close. Are any of your makers set up to quote equity underlyings, or is it crypto-only on their side too?
```

### 5. Note Systems (optional, X DM)

```
Hi, I'm the one who ran 3,683 of your default notes (2015 to 2025) for the writing contest. I've since built weekly calls and puts on xStocks on Solana, settling on the 4 PM Pyth print. Is Solana on your roadmap? If it is, I'd rather build it with you than next to you.
```
