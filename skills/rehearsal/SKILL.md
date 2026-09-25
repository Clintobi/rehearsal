---
name: rehearsal
description: Check and protect tokenized-stock trades on Solana (xStocks like NVDAx, SPYx, AAPLx and PreStocks pre-IPO tokens like OPENAI, ANTHROPIC, SPACEX). Use before buying or selling any tokenized stock, when asked whether a stock token's price is fair, whether it can be sold at size, what the token legally represents, or to build a swap that cannot fill worse than fair value. Uses the Rehearsal MCP server or REST API; no key needed.
---

# Rehearsal: tokenized stock passports and protected swaps

Tokenized stocks trade 24/7 on Solana, but the price evidence behind them does not. Pyth's free on-chain equity prices update only in the US regular session, pools drift while markets are closed, pre-IPO tokens trade far from their marks, and some tokens are thin enough that a normal-sized sale moves them several percent. This skill makes an agent check all of that before trading and lets the chain enforce the limit.

## Connect

- MCP (preferred): `https://rehearsal-stocklana.vercel.app/api/mcp` (Streamable HTTP, stateless, no auth)
  - Claude Code: `claude mcp add --transport http rehearsal https://rehearsal-stocklana.vercel.app/api/mcp`
- REST: `https://rehearsal-stocklana.vercel.app/api/v1/openapi.json`

## Instructions

1. **Always call `passport` (or `check_trade` when speed matters) before a tokenized-stock trade.** Pass the symbol, USD size and side.
2. **Follow `decision.action`:**
   - `proceed`: the fill is within tolerance of fair value.
   - `reduce_size`: most of the gap is your own size. Split the order or use a smaller size and re-check.
   - `wait`: the stock is halted, the market is closed and the fill is off the 24/7 price, a share-multiplier change is imminent, or reserves look short. Do not trade now. For xStocks you can queue for the opening cross in the app instead.
   - `avoid`: the fill is well past fair value for reasons other than size.
3. **Read `evidence.level`:** `live` (Pyth, regular session) and `perp` (24/7 perp mark while US markets are shut) are strong. `issuer` and `mark` are weaker: tell the user the reference is a valuation or issuer price. `stale` and `halted` mean protection refuses.
4. **Check `exit` before large buys.** `exit.within` gives the largest sale inside 1%, 2% and 5% of the current price. Don't buy more than you could sell within the user's tolerance.
5. **Execute with `build_protected_swap`.** It returns an unsigned v0 transaction whose Jupiter minimum output equals fair value ± `max_gap_bps`. If the market moves past that before it lands, the whole transaction reverts and nothing is traded. Treat `max_gap_bps` as the user's mandate: never raise it without asking.
6. **After sending, call `verify_receipt` with the signature** and report the fill price, gap vs fair and `verified`.
7. **PreStocks are not shares.** They track SPV exposure, can't be redeemed at the mark on demand, and pay a 1% fee on every transfer. Always tell the user the premium to the mark and the break-even listing value (`prestocks_research`).

## Examples

User: "Buy $500 of NVIDIA stock on Solana."
1. `passport {symbol: "NVDAx", usd: 500, side: "buy"}`, then read the decision, evidence and exit.
2. If `proceed`: `build_protected_swap {symbol: "NVDAx", usd: 500, side: "buy", wallet: <user>}`, have the user sign, send, then `verify_receipt`.

User: "Is the OpenAI token a good deal?"
1. `prestocks_research {symbol: "OPENAI"}`, then report the implied valuation vs the mark, the break-even listing value, exit depth, and that it isn't a share.

## Guidelines

- Never present an issuer price or PreStocks mark as a live market price.
- Never retry a reverted protected swap with a wider limit unless the user agrees.
- Weekends and nights: judge against the 24/7 perp, not the last close.
- Not investment advice. Rehearsal shows prices and enforces limits; it does not custody funds.
