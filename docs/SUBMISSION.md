# STOCKLANA submission: Rehearsal

**Tracks:** Main track, PreStocks bounty, Pyth bounty, Meteora DBC bounty. Only PreStocks pre-IPO tokens are integrated (per the PreStocks rules).

**Links**
- Live app: https://rehearsal-stocklana.vercel.app (Trade, Markets, Pre-IPO, Orders, Report)
- For agents (MCP + REST): https://rehearsal-stocklana.vercel.app/agents · MCP URL `https://rehearsal-stocklana.vercel.app/api/mcp`
- Judge walkthrough: [DEMO.md](../DEMO.md)
- Open execution report: https://rehearsal-stocklana.vercel.app/report
- Code: https://github.com/Clintobi/rehearsal
- Programs (devnet): Rehearsal Guard `TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE`, Rehearsal Gate `4MtrgDQpbgjpzcAcL5Ftm8E1L37deBnZ5f2Pi6WmpqPE`
- Blink Action (live): https://rehearsal-stocklana.vercel.app/api/actions/rehearse/OPENAI (the dial.to registry is paused, so there is no registry listing)

## One line
See Monday's move on Sunday. Rehearsal turns weekend tokenized-stock prices into a forecast of Monday's open with a public track record (Nvidia: right direction 26 of the last 29 weekends), shows the real price before you buy, blocks any fill worse than your limit on-chain, and (coming after audit) pays a weekly premium on the stocks you hold.

## How it fits together
- **For users:** see Monday's move (Weekend), never pay the markup (price check + protection, Markets, Pre-IPO), earn a weekly premium (Earn, in testing).
- **Underneath, one engine:** a reference price for every market state (Pyth in session, a 24/7 perp outside it, the 4 PM close, halts mirrored on-chain), used by the forecast, the price check, the protection floor, Earn settlement and the public execution report.

## The problem
Tokenized stocks trade 24/7 on thin pools; the real share trades 6.5 hours a day; pre-IPO companies don't trade at all. 63% of Solana tokenized-stock volume happens while US exchanges are closed (Allium), and Pyth's free on-chain equity prices only update in the regular session. On 17 Sep 2026 the SEC exempted on-chain tokenized-stock venues from Rules 605 and 611 and set no best-execution standard (Rel. 34-106402). Nothing between a quote and a signature tells a trader what the token legally is, whether the price is anchored to anything, whether they could sell it back, or stops a bad fill. Agents are about to trade these markets at machine speed with the same blind spots.

## What we built
1. **Tradability passport** (Trade page, `/api/v1/passport`, MCP `passport`). Per token: the legal wrapper, live proof of reserves and upcoming corporate actions; price evidence by market state from a [published policy](https://rehearsal-stocklana.vercel.app/api/v1/policy) (Pyth in the session, the Lighter 24/7 perp outside it, the PreStocks mark for pre-IPO, refuse while halted); exit capacity (largest sale within 1/2/5% of the current price, vs the biggest wallet); the exact fill for your size; and a decision (proceed, reduce_size, wait, avoid).
2. **Protected swaps on mainnet, today.** The Jupiter route's minimum output is set from fair value ± the user's limit instead of from the quote, so Jupiter's program reverts the whole transaction below it. The fair price, source, limit and floor go into a memo; `/api/v1/certificate?sig=` re-reads the chain and verifies the fill. Token-2022 fees and scaled-UI multipliers are counted.
3. **Agent layer.** MCP server (10 tools, stateless HTTP, no key), REST + OpenAPI, `llms.txt`, installable skill. The mandate (`max_gap_bps`) is enforced by the chain, not by the agent. `agent_scorecard` grades any wallet's sampled fills against fair value with markouts.
4. **Rehearsal Gate for Meteora DBC.** A Token-2022 transfer hook for launches priced in a tokenized stock: bound atomically to the quote stock's on-chain circuit breaker, it pauses every transfer of the launch token while that stock is halted on Nasdaq, and DBC removes it at graduation. Mirrors the halt rule listed markets follow.
5. **Pre-IPO view.** Every PreStocks token: what its price values the company at, premium to mark, the listing value needed to break even after the 1% in and out, float, exit depth, SpaceX pre-IPO vs listed, and the SPV structure risks.
6. **Open execution report, bots removed, ZK-proven.** Real fills graded against fair value by venue, router, size and session, with 5-minute markouts. Wash-trading round-trippers are excluded (207 fills). The dataset hash is committed on Solana each update, and a Groth16 proof of the report (over the first 310-fill snapshot) is verified on-chain by the guard program.
7. **Earn** ([/app/earn](https://rehearsal-stocklana.vercel.app/app/earn)). Weekly covered calls and cash-secured puts on xStocks: writers escrow the stock or USDC in full and set their own premium; anyone can buy. Every series settles on the last Pyth price published at or before Friday's 16:00 New York close, fixed at 16:15. Program `rehearsal_earn` passes 31/31 on a mainnet fork; the page runs against that fork and shows "In testing" on the live site until an audit.
8. **Weekend** ([/app/weekend](https://rehearsal-stocklana.vercel.app/app/weekend)). While US markets are shut: where each stock should reopen, from its token's move on Solana since the close, with a published track record (e.g. NVDA right direction 26 of 29 weekends, median miss 0.27%). And for lenders: the reopening drop that liquidates a maxed-out Kamino loan (limits read from Kamino's reserves on-chain) against 2 years of real reopenings.
9. **Rehearsal Guard program** (devnet): on-chain Pyth checks at execution time, LULD-style circuit breakers synced to Nasdaq halts, fair orders with opening and closing crosses (the 4 PM close is computed on-chain, daylight saving included).

## Evidence
- Mainnet fork (Surfpool, real Jupiter routes, Pyth accounts, mints, Meteora DBC and token badges): protected swaps 5/5 (a floor above the route reverts inside Jupiter with 6001; NVDAx buy/sell and a PreStocks buy fill and verify), Rehearsal Gate 8/8 (fills; buys and sells revert in the gate while SPY is halted; resume; hook removed at graduation), guard 9/9, breaker 13/13, fair orders and opening cross 17/17, closing cross 12/12.
- Devnet: guard smoke test 11/11; a live DBC pool gated by the NVDA breaker the halt relayer keeps in sync (`docs/devnet-gate-output.txt`); Groth16 report proof verified on-chain ([tx](https://explorer.solana.com/tx/xWLNrsazKgyC2xADjP3nUACbvqzTYTBrfdDvPtAYtZTtvFH8UWGZkyEHBw4kjqEqfyriJcgRBrteJLfqAkNsJQk?cluster=devnet)); a tampered proof is rejected.
- Earn: fork test 31/31 (`scripts/fork-earn-test.ts`), API flow 8/8 (`scripts/earn-api-test.ts`), 6 Rust unit tests on settlement math.
- MCP verified with the official MCP inspector (tools/list, tools/call).
- 14 Rust unit tests (fixed-point math, cross quantities, breaker state machine, New York clock, ZK verifier).

## PreStocks-specific
- The 1% transfer fee is handled everywhere: quotes, protected-swap floors (tested on a fork), break-even valuations.
- Pre-IPO page: OpenAI's token values the company about 32% over the PreStocks mark; its largest wallet could sell only about 6% of its position before the price drops 5%.
- SpaceX pre-IPO vs listed SPCXx; the 5× multiplier; SPV structure and the May 2026 validity debate stated plainly.

## Pyth-specific
Pyth `Equity.US` price accounts are read on-chain (no key) for every check, the guard, the breakers, both crosses and the report. The policy is explicit about Pyth's regular-session coverage and falls back to a 24/7 perp outside it; Pyth Pro's 24/7 `Equity.Index` feeds (including OpenAI and Anthropic) slot in as soon as a key is available.

## Meteora-specific
The Gate uses DBC's transfer-hook configs (`create_config_with_transfer_hook`, `swap2_with_transfer_hook`) with an xStock quote and its token badge. Stock-quoted launches exist (StockLaunch and others); what's new is a launch that obeys the stock market's halts, bound at creation and removed at graduation.

## Business
Consumers: a small fee only on protected trades (0.1–0.25%). B2B: wallets and apps embed the passport and protection API; launchpads add the Gate; venues and lenders buy the report, exit-capacity and halt data. First market: Nigeria, where stablecoin holders lack a fair route to US stocks. Distribution through licensed partners (the Dangote IPO's on-chain allocation ran through NectarFi and GetEquity), not a self-issued rail.

## Honest limits
- Protected swaps on mainnet fix fair value when the transaction is built (it's valid for about a minute); the guard program, which reads Pyth at execution, is on devnet until its mainnet deploy (about 4 SOL).
- Pyth is a reference price, not the legal NBBO. The perp mark is an estimate while the market is shut.
- Exit capacity comes from quotes, not a promise of liquidity.
- The Gate mirrors halts; it is not a compliance claim.
