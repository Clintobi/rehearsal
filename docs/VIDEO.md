# Demo video (about 3 minutes)

Record at 1440×900 with your own voice. Say the numbers the screen shows on the day. The figures below are from 25 Sep.

Before recording:
- `MAINNET_RPC=<helius> scripts/fork-up.sh` in one terminal, with the font enlarged.
- Have these tabs open: `/report`, the home page, the Blink on dial.to, and the devnet program on Solana Explorer.

## 0:00 The hook (20s)
Screen: `/report`, top.
> "On September 17th the SEC exempted on-chain stock venues from Rule 605, the rule that makes brokers publish how well they fill your orders. So on Solana, nobody has to tell you whether you got a fair price. We built it anyway."

## 0:20 The report card (35s)
Scroll through the size table, CRCLx, and the worst fills list.
> "This records real tokenized-stock trades on Solana and grades each one against the real stock price at that second. Big names with a live Pyth price fill within a few basis points. Trades under $100 pay about ten times more than $100 to $1,000 trades. Circle's token fills a third of a percent over its reference."
Then open "Verify this report".
> "You don't have to trust us. The dataset is published, its fingerprint goes on-chain every ten minutes, and one command recomputes every number."

## 0:55 Before you trade (25s)
Screen: home page, rehearse OPENAI for $1,000.
> "Before you buy, Rehearsal quotes your real fill. OpenAI's token fills about 39% over its own mark, after the 1% transfer fee most tools miss."
Tick "Guard this trade on-chain".

## 1:20 The guard and the brake (45s)
Screen: terminal. Run `npx tsx scripts/fork-app-test.ts`.
> "The guard is a Solana program that wraps any swap. In the same transaction it checks what you actually received against Pyth, and reverts everything if it's worse than your tolerance. Apple goes through. OpenAI at 39% over mark gets blocked on-chain, and no funds move."
Run `npx tsx scripts/fork-breaker-test.ts`.
> "Every stock also has a circuit breaker, like the stock market's limit-up limit-down rule. We shock NVIDIA 8%: limit, pause, reopen. And when Nasdaq halts the real stock, a relayer mirrors it on-chain. That halt is the one thing the SEC's exemption requires, and nothing on Solana did it until now."

## 2:05 Fair orders and the Monday cross (40s)
Screen: home page, the fair orders section, then run `npx tsx scripts/fork-orders-test.ts`.
> "Then an order book where the limit is fair value. A market maker tries to fill at 2% over: rejected. At 0.2% over: filled. A better quote under fair: the buyer keeps the difference. Orders placed on a Friday wait out the weekend. When Pyth prints again Monday, everyone crosses at one price: $231.2865, to the cent."

## 2:45 Close (15s)
Screen: the devnet program on Explorer, then the GitHub repo.
> "Rehearsal is best execution for tokenized stocks: a report card anyone can verify, a guard and circuit breaker on-chain, and fair orders that don't let the weekend set your price. Live on mainnet for checks, and on devnet for the program. Everything is open source."
