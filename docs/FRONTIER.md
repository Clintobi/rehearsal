# What's possible: the best-execution layer for on-chain stocks

Compiled 24 Sep 2026 from three research passes: execution quality on other chains, TradFi market structure, and the cryptographic and infrastructure frontier. [V] means the source was opened, [S] means search snippet only.

## Why now

- **SEC "Innovation Exemption", Rel. 34-106402, 17 Sep 2026 [V, Sidley].** On-chain AMM venues for tokenized NMS stocks ("TSVs") get five years of relief, through 2031. "Rules 605, 610, 611, 612, and 613 do not apply." No best-execution or NBBO standard is imposed. TSVs "must halt trading when the primary listing exchange halts the underlying stock." Caps: 75 Tier-1 symbols at 0.25% of ADV, and 250 Tier-2 symbols at 2.5%. https://www.sidley.com/en/insights/newsupdates/2026/09/sec-issues-innovation-exemption-for-onchain-trading-of-tokenized-us-listed-stocks
- **SEC Investor Advisory Committee, 12 Mar 2026 [V].** Warned that best execution "would potentially no longer apply," and named the missing protections: order protection, Rule 605/606 execution reports, kill switches and circuit breakers.
- **The new Rule 605 took effect 1 Aug 2026 in TradFi [V].** Brokers and market centers now publish effective spread, the E/Q ratio, realized spreads at 50ms to 5m, and price improvement. On-chain stock venues are exempt, so retail gets that protection only when trading off-chain.
- **The data now exists [S].** Pyth is a Nasdaq Basic distributor (22 Sep 2026), carries Blue Ocean overnight prices (exclusive into DeFi through the end of 2026), and has 24/7 single-stock indices (since 10 Jun 2026).

## What nobody does, anywhere (searched; "not found" rather than proven absent)

1. **An open Rule 605 for tokenized stocks.** Every on-chain fill is scored against Pyth at its slot: effective spread, E/Q, price improvement, and markouts at 1s, 15s, 1m and 5m, bucketed by size, per venue and aggregator. The numbers are published and anyone can recompute them. Dinari claims NBBO execution and xChange claims "real market price", but no public proof exists anywhere.
2. **An LULD-style circuit breaker with halt-sync, as shared on-chain state.** It keeps a rolling 5-minute Pyth reference with tier bands, a limit state, a pause and a reopen, and syncs to primary-exchange halts, which is the exemption's one hard condition. Existing guards use static bands only.
3. **A weekend and Monday-open cross.** Orders placed while the market is closed are collected, then cleared at one uniform price bounded by the first real reopening print, so nobody has to trade into a stale 24/7 pool.
4. **A fair-value intent auction.** The user's floor is computed on-chain from Pyth, not typed in by the user. Prop AMMs, xChange RFQ and Jupiter routes compete above it. CoW and UniswapX use the user's own limit, not an oracle.
5. **Session-aware "discovery bounds" for spot trading.** Borrowed from trade.xyz's perps: off-hours tolerance widens with time since the close and re-anchors at the edges. Today this exists only for perps.
6. **ZK-proven execution reports.** An SP1 proof, verified on Solana (about 280k CU), aggregates signed Pyth Pro prices and guard receipts into a report nobody has to trust the operator for. The fill set's completeness still depends on an indexer until light-client proofs are practical.
7. **A verifiable pre-IPO mark.** zkTLS (Reclaim has a Solana verifier) could prove a secondary-market price that sits behind a login, such as Forge or Caplight. This is the one place zkTLS is essential. Data licensing has to be cleared.

## Already done, so don't claim it

- A guard that reverts a bad fill: Closing Bell (Stocklana, devnet), scrip (mainnet, own flow), holdfill (own flow), Lighthouse (assertions, no cross-account arithmetic).
- A premium/discount board: many entries.
- Implied valuation: PreStocks' own API returns `impliedValuation`.
- Scaled UI multiplier handling: several entries.

## The architecture

```
Reference   session-aware fair value: Pyth Pro signed price, 24/7 index, Blue Ocean overnight,
            discovery bounds off-hours, corporate-action aware; issuer mark ± multi-source range for pre-IPO
Enforce     Rehearsal Guard around any swap, any wallet   +   shared circuit breaker with halt-sync
Improve     fair-value intent auction during market hours, open and close cross when the market is closed
Prove       open Rule 605: every fill scored vs Pyth, published per venue, recomputable, later ZK-proven
Distribute  wallet check, Blinks, receipts
```

Rehearsal is the retail side of the best-execution stack that the SEC exemption stopped requiring.

The 25 Sep 2026 submission stops at published grades plus the SP1 `--execute` public values ([DEMO.md](../DEMO.md)). Item 6, a ZK-proven report verified on Solana, is still future work. Tonight does not include a Succinct Prover Network Groth16 proof.
