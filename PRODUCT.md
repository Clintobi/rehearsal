# Product

## Register

product

## Users
Everyday investors who buy tokenized stocks on Solana: xStocks (1:1 backed US equities like NVDAx, AAPLx) and PreStocks (pre-IPO exposure like OpenAI, SpaceX). Most are retail, many outside the US, often trading from a phone, sometimes on weekends when the real market is closed. Their job: buy or sell a tokenized stock without overpaying, and know what their holdings are really worth. A smaller second audience of market makers, venues and reviewers reads the public execution report.

## Product Purpose
Rehearsal is best execution for tokenized stocks. Before a trade it shows the real fill against the real stock price. During the trade an on-chain guard and circuit breaker refuse bad fills. Fair orders let market makers compete to fill at or better than fair value, and weekend orders wait for the Monday open. A public report grades every venue. Success means a user trusts the verdict enough to act on it, and never pays a surprise premium they could have avoided.

## Brand Personality
Premium, precise, trustworthy. The voice is conversational in the way a good retail broker is: short, plain sentences that name the dollar amount ("You'd pay $14 more than it's worth") rather than jargon ("+47 bps premium to reference"). Numbers lead. It never hypes and never lectures. It feels like a serious financial institution you'd hand real money to, with the warmth of a modern consumer app. Reference feel: Robinhood, Public, Wealthsimple.

## Anti-references
- Hackathon demo pages: a long single scroll of explained features, test-result paragraphs, "built for X" copy.
- AI-slop copy that over-explains every element inline. Explanations belong in one tooltip or one "How it works" page, not under every number.
- Crypto degen aesthetics: neon, dark purple gradients, glowing coins, emoji.
- SaaS landing clichés: hero metric blocks, identical three-card feature grids, eyebrow labels on every section.
- Pro-terminal density that intimidates a first-time buyer.

## Design Principles
1. The verdict first. Every screen answers "is this a fair price?" before anything else, in words and dollars, then shows the detail on demand.
2. Money in dollars, precision in the details. Lead with $ amounts people feel; keep bps, oracle ages and multipliers one tap away for those who want them.
3. Earn trust by showing the receipt. Every claim links to its proof (a transaction, a dataset, a feed). Never claim what isn't live.
4. Calm under pressure. Bad news (overpaying, halted, paused) is stated plainly and steadily, never with alarm styling or panic copy.
5. One job per screen. Trade, Portfolio, Orders, Report and Markets are separate places, not one endless page.

## Accessibility & Inclusion
WCAG 2.2 AA. Text contrast at or above 4.5:1 (3:1 for large text) in both light and dark themes. Full keyboard navigation with visible focus. Good/bad is never conveyed by red/green alone: always pair it with a word, sign or icon. Every animation has a `prefers-reduced-motion` alternative. Tabular figures for all prices.
