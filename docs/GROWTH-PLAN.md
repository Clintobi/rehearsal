# Growth plan: game first, stocks in one tap

Draft, 26 Sep 2026. Target: live before the Colosseum deadline (12 Oct).

## The idea in one line

People come for the game and stay because owning the stock is one tap away. The account you make to save your streak is also your wallet, so playing the game is how people start on Solana without noticing.

## How it should feel

Premium and calm (see PRODUCT.md): Robinhood or Apple Fitness, not a casino. "Cool" comes from motion, speed and live moments, not neon or emoji.

How we treat users:
- **No signup to start.** You play first, and only make an account when you want to keep something.
- **Every price in dollars, all-in, before you tap.** No surprises and no jargon ("tokens", "slippage", "SOL" never appear on the main path).
- **No gas.** We pay the network fees, so a new user only ever needs dollars.
- **We tell you when to wait.** If the weekend price is marked up, we say "Wait until Monday, you'd save $4.10". No other app does this, and it's why people will trust us.
- **Protected by default.** Every buy uses the protected swap, and you get a receipt.
- **Getting money out is as easy as putting it in.** Sell back to dollars and cash out to a card or bank.

## 1. The front door: Monday Call

The home page is this weekend's round.

- **The first screen asks one question:** "Where does Nvidia open on Monday?", with big **Up** / **Down** buttons. One tap, no account, and your call is in.
- **Swipe through the rest:** on a phone, a deck of stocks. Swipe up or down, or tap to add an exact %. There's a light haptic on each call.
- **Instant reveal after each call:** your call next to the crowd's split and Rehearsal's forecast (with its record, e.g. "right 26 of 29 weekends").
- **The weekend is live:** a small live line shows the token moving while Wall Street is closed. "Nvidia's token is up 0.8% since Friday's close" makes it clear why this works.
- **The Monday open is an event** that people tune into, like HQ Trivia:
  - 9:25 New York: a push or Telegram alert says "The open is in 5 minutes."
  - At 9:30, the results reveal one stock at a time: your call, the crowd, the model, the real open.
  - The results card is ready to share.
- **Scoring:**
  - Right direction: 10 points.
  - Closeness: up to 10.
  - Beating the model: 5.
  - Streaks multiply your score.
  - Holiday Mondays roll to the next trading day.
- **Play anywhere:**
  - On the web.
  - Inside a tweet, via a Blink.
  - In Telegram (`/call nvda up 1.2`). The bot works in group chats, and each group gets its own leaderboard.
- **Between weekends:** a daily **Close Call** asks where a stock closes today at 4pm, so there's something to do every day.
- **No money at stake.** Prizes are badges and leaderboard spots only.

## 2. The bridge: from a call to owning the stock

After your call, one calm line appears: **"Back your call: own $10 of Nvidia."**

1. **Choose an amount:** $5, $10, $25, or your own amount.
2. **Sign in with Apple, Google or email.** It takes one tap, and creates your wallet and saves your streak.
3. **Pay with Apple Pay, a card or a bank transfer.** People who already have a wallet (Phantom or others) skip this step. On a phone, one tap opens Rehearsal inside Phantom.
4. **Done:** "You own 0.07 Nvidia shares, worth $12.40." The stock is backed 1:1 by a real share, which one line explains.
5. **Eligibility:** asked once, before the first buy. xStocks can't be sold to US persons or people in some other countries.

## 3. The home you keep: portfolio and alerts

- **Portfolio in plain words:** what you own, worth in dollars, and "Monday preview: your stocks should open +0.6%".
- **Alerts** go to Telegram first and the browser second, for:
  - A price more than 2% from the real stock (you can change the 2%).
  - A halt or resume.
  - The Sunday-night preview.
  - Monday results.

  Each alert has a one-tap link to buy or sell at a protected price.
- **Gift a stock (stretch):** send $10 of Nvidia as a link. The friend opens it, signs in with email, and owns it. Every gift brings in a new user.
- **Buy every week (stretch):** "Every Monday, $10 of Nvidia."

## Build order

| Days | Work | Result |
|---|---|---|
| 1–4 | Rounds, calls, scoring, leaderboard, the game-first home page, the swipe deck, share cards, the Blink | First real round on 3–5 Oct |
| 5–7 | Sign-in with a built-in wallet, "Back your call" in dollars, paid gas, eligibility check | A new user can go from a call to owning a stock |
| 8–10 | Telegram bot (calls, groups, alerts), the live Monday reveal, Sunday preview, Close Call | Reasons to come back every day |
| 11–12 | Second scored round on 10–12 Oct: collect real numbers | Evidence for the submission |
| 13–16 | Polish, cash-out flow, gift links if time allows, submission and video | Submit by 12 Oct |

## Decisions needed

1. **Database:** use the existing Supabase project (`uwzubavqbzmuwraxpsrh`) for new tables only.
2. **Sign-in, card payments and paid gas:** Privy (recommended: one integration covers all three). The alternative is Phantom's own email login plus a separate card provider.
3. **Telegram bot:** a token from @BotFather, stored in Vercel as `TELEGRAM_BOT_TOKEN`.
4. **Scheduled jobs:** Vercel Cron on a paid plan, or a free external scheduler.
5. **Gas budget:** paying fees costs about $0.001 per trade, plus about $0.30 the first time each new user holds a stock (Solana charges this per token account, and it can be refunded when the account is closed). Is a cap per user needed?
