# Demo video (2:45)

Record the screen at 1440×900 and your voice on top. One take per scene is fine. Say the numbers the screen actually shows on the day. The figures below are from 24 Sep.

## 0:00 Hook (15s)
Screen: the board, sorted by largest gap.
> "Tokenized stocks trade 24/7 on Solana. The real stock doesn't, and pre-IPO companies don't trade at all. So what you pay can drift a long way from fair value. Right now OpenAI's PreStocks token fills about 38% over its own mark, and nothing on the way to your signature tells you."

## 0:15 Rehearse a trade (35s)
Screen: pick OPENAI, $1,000, Rehearse.
> "Rehearsal quotes my exact order on Jupiter and prices it against a fair reference. For PreStocks that's the issuer mark. For xStocks it's Pyth's price of the real share, read straight from the Pyth account on Solana."
Point at: gap, implied valuation ($1.75T vs a $1.27T mark), and the transfer-fee line.
> "It counts the things people miss. PreStocks withhold 1% on every transfer, and SpaceX's token has a 5× split multiplier in Token-2022. Get either wrong and your numbers are off by a lot."
Then switch to NVDAx: "Same check on NVIDIA: within 0.1% of Pyth. Fair."

## 0:50 The guard (50s), the core of the demo
Screen: split. Left, the app with "Guard this trade on-chain" ticked. Right, a terminal.
> "A warning is still just a warning. So I built the Rehearsal Guard, a Solana program. It wraps any Jupiter swap in the same transaction. It snapshots my balances, lets the swap run, then measures what I actually received and values it at Pyth. If I got a worse deal than my tolerance, the whole transaction reverts."
Terminal: `npx tsx scripts/fork-app-test.ts` on the Surfpool mainnet fork.
> "This is a local fork of mainnet with real Jupiter routes and real Pyth accounts, driven through the app's own API. Apple at 1% tolerance: filled inside the guard. OpenAI with a 5% cap over mark: the guard measures it at 39% over and blocks it on-chain, and no funds move. The app predicted 39.2% before the trade and the chain measured 39.35%."
Show the `docs/fork-test-output.txt` list briefly: spoofed oracle, fake oracle, open without close — all rejected.

## 1:40 Your wallet (35s)
Screen: paste the $565k holder address, Check wallet.
> "Holders need this too. Paste any wallet and it compares each position's fair value with what selling right now would really pay. This wallet holds $386,000 of SpaceX PreStocks, and Jupiter has no route for it at that size. There's no exit on-chain today."

## 2:15 SpaceX listed (15s)
Screen: the SpaceX section.
> "SpaceX has listed. The pre-IPO token still trades, 19% below the listed share. That discount is the price of waiting on conversion, and now you can see it."

## 2:30 Close (15s)
> "Rehearsal: know what a tokenized stock really costs before you sign, and have the chain refuse the trade if it's worse. Live on mainnet, guard program open-source, 9 of 9 fork tests passing."
Show: the URL, the GitHub link, and the program id.
