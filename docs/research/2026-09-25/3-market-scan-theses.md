# Tokenized stocks on Solana: which of the 8 ideas are already taken (checked 25 Sep 2026)

**Scores** (whitespace × size × Solana-fit, out of 10):

| Thesis | Score |
|---|---|
| T8 (includes T1) | 6 |
| T5 | 5 |
| T1 on its own | 4 |
| T4 | 4 |
| T2: global money into EM securities | 4 |
| T3 | 3 |
| T6 | 3 |
| T2: EM users buying US stocks | 2 |
| T7 | 2 |

**Legend:** V = verified, with link. U = unverified. "API" = my own sums from live API data pulled 25 Sep.

**Method:** the session's web-search quota was exhausted. I used live APIs, Google News RSS (links decoded), rwa.xyz, company docs and the SEC order PDF instead.

## Background facts that change the scoring

**The SEC's new rule (Release 34-106402, 17 Sep 2026).** It creates a new type of US trading venue, a "Tokenized Securities Venue" (TSV).
- TSVs may run permissioned AMM pools for KYC'd US persons. Oracles and 24/7 trading are allowed. Order books are not.
- Liquidity providers are exempt from registering as dealers.
- Caps apply per venue:
  - Tier 1: 75 symbols, and at most 0.25% of the stock's prior-month average daily volume.
  - Tier 2: 250 symbols, and at most 2.5%.
  - Breaching a cap forces a 3-month pause.
- Halts mirror the primary exchange.
- Every trade must be published in USD within 10 minutes.
- TSVs are not "trading centers" under Reg NMS, so Rule 605 execution-quality reporting doesn't apply to them.
- No margin. The exemption runs 5 years.
- Sources: [V sec.gov/files/rules/exorders/2026/34-106402.pdf; sullcrom.com/insights/memo/2026/September/SEC-Issues-Innovation-Exemption-for-Tokenized-Securities]
- Cointelegraph says xStocks and Robinhood's current tokens don't qualify as structured, and sees Ondo as better placed. [V tradingview.com/news/cointelegraph:5e14fca06094b:0-winners-and-losers-of-the-sec-s-new-tokenized-stocks-rules/]

**Market-size numbers are unreliable.**
- rwa.xyz shows $5.48B across 3.92M holders: xStocks $2.9B, Ondo $870M, bStocks $762M. [V app.rwa.xyz/stocks]
- Two days ago the press, citing rwa.xyz, said $3.15B. [V finance.biggo.com/news/39658f33-9860-49f0-bc3a-a597026df5ec]
- Only $718M of xStocks sits on Solana. [V app.rwa.xyz/networks/solana]

**Volumes.**
- Solana stock-token spot trading is at least $199M/day: xStocks $111M, Backpack $60M, Ondo $20M. [V lite-api.jup.ag/tokens/v2/search, API]
- Coinbase's stock tokens on Base hit $100M/day 26 days after launch. [V startupfortune.com/coinbases-tokenized-stocks-on-base-just-hit-100-million-in-a-single-day/]
- Stock perps on centralized exchanges do about $12.8B/day, against about $1.6B/day on-chain. [V Binance/OKX/Bitget/Bybit ticker APIs, API]
- In July, spot was $7.5B against $376B of perps. [V rwatoday.news/tokenized-equities-coingecko-report-spacex-pre-ipo-perpetuals-2026]

## T1: Execution-quality / transaction-cost analysis

**(a) Who already does it**
- **Blockworks Research published this exact method on 4 Sep.** [V x.com/minnus/status/2095848292189982836]
  - It measured real fills against the official US best bid/offer and Blue Ocean's overnight quotes, split by issuer, session and size.
  - Backpack's SPCX filled 1.23 bps cheaper than xStocks' SPCXx.
  - Robinhood Chain cost 5.8–12.1 bps more than Solana.
  - A sequel is promised.
- **Blockworks' 21 Sep report was paid for by Native.** [V app.blockworksresearch.com/research/native-scaling-tokenized-equity-markets]
- **Kaiko** is the best-funded company positioned to own this category:
  - It extended its Series B to $110M in a round led by S&P Global on 14 Sep. [V coindesk.com/business/2026/09/14/kaiko-extends-series-b-funding-round-to-usd110-million-with-s-and-p-global-bnp-paribas]
  - It owns Amberdata. [V kaiko.com/news/kaiko-acquires-amberdata-in-landmark-digital-asset-data-consolidation]
  - It sells equity reference rates that blend in tokenized venues. [V kaiko.com/equity-rates]
- **ClearTrace** is a "neutral referee" for DEX execution, but covers EVM chains only. [V cleartracedata.com]
- **Solidus Labs** sells a best-execution product. [V soliduslabs.com/reports/execution-quality-digital-assets]

**(b) What's missing:** a continuous, independent, open-method measure. It would cover each issuer and route (prop AMM, pools, RFQ), each order size and each session, weekends included. TSVs are exempt from Rule 605 [V order], and I found no voluntary equivalent (U).

**(c) Demand:** the median trade is $144, so retail won't pay. [V Allium: cdn.prod.website-files.com/6a28a84d9525ef655a2a27a5/6a454733d89555f7e02a5847_Tokenized%20Equities%20onchain%20report.pdf] Venues do pay for studies, as Native shows.

**(d) Difficulty:** low capital and low regulatory risk. The technical work is moderate: decoding prop-AMM fills, and there is no weekend reference price.

**(e) Score: 4/10 on its own.** The method is already public, and Kaiko can productize it first.

## T2: Emerging-market securities

### Direction 1: global money buying EM securities

**(a) Who already does it**
- **The Dangote IPO is already on-chain.**
  - The IPO is ₦2.15T (about $1.6B) and closes 13 Oct. GetEquity opened on-chain routes on 14 Sep; NectarFi runs the Solana one. [V mexc.com/crypto-pulse/article/dangote-refinery-ipo-goes-on-chain-154480; apnews.com/article/nigeria-refinery-dangote-f3cc90fde930845eefd8bcc6231adb02]
  - Week one: about $15.8k from 203 wallets. The Solana tranche is 9.3% sold. [V afriflux.xyz/feed/dangote-ipo-first-week]
  - The on-chain route is not on the issuer's official channel list. [V ipo.dangote.com]
  - GetEquity says it is "not registered with any regulatory agency". [V getequity.io]
- **Off-chain channels already serve the diaspora:** Daba (250k+ customers) and Flutterwave. [V dabafinance.com/en/insights/how-to-invest-dangote-ipo-daba-finance]
- **EM bonds barely use Solana:** Etherfuse has $18M in total, only $0.8M of it on Solana. [V app.rwa.xyz/platforms/etherfuse]
- **EM ETF tokens on Solana sit unused:** EEMon has 73 holders. [V lite-api.jup.ag/tokens/v2/search?query=EEMon]

**(b) What's missing:** licensed, redeemable Nigerian blue chips that trade 24/7 for USDC after listing. The blocker is licensing and custody through CSCS, Nigeria's securities depository, not a lack of ideas.

**(c) Demand**
- Nigeria received $92.1B on-chain in a year. [V chainalysis.com/blog/subsaharan-africa-crypto-adoption-2025/]
- Remittances into Nigeria were $21.8B. [V vanguardngr.com/2026/05/diaspora-remittances-stabilises-at-21-8bn-in-2025-amid-global-pressures/]
- But measured on-chain demand is tiny.

**(d) Difficulty:** high. It needs SEC Nigeria approval, a licensed broker/custodian and a way to repatriate naira, and every country needs its own licence.

**(e) Score: 4/10.**

### Direction 2: EM users buying US stocks (saturated)

- Binance offers 7,000+ US stocks outside the US. [V coinmarketcap.com/academy/article/%20binance-tokenized-us-stocks-launch]
- xStocks has 300k+ holders across 110+ countries. [V tradingview.com/news/financemagnates:fff9ad90b094b:0-kraken-s-xstocks-backing-assets-top-800-million-as-holders-pass-300-000/]
- Luno has 50k xStocks users in South Africa. [V techafricanews.com/2026/06/02/luno-hits-50000-xstocks-users-as-south-africans-embrace-tokenised-investing/]
- Robinhood's stock tokens are available in 120+ countries. [V robinhood.com/us/en/newsroom/robinhood-accelerates-global-expansion-robinhood-chain-mainnet-stock-tokens-agentic-trading/]
- I found no stock products at Afriex, Yellow Card, Kotani, Mansa or Onafriq (U). "Ownify" is not a relevant company.

**Whitespace:** none. **Difficulty:** licensing and the cost of acquiring users. **Score: 2/10.**

## T3: Liquidity / market-making engine

**(a) Who already does it**
- **Jupiter's RFQ market makers already fill $10–100k stock orders.** [V lite-api.jup.ag/ultra/v1/order, API] Costs measured against Jupiter's own price:

  | Token | Cost |
  |---|---|
  | NVDAx | 8–11 bps |
  | TSLAx | 19–35 bps |
  | SPYx at $100k | 3 bps |

- **Prop AMMs already quote stocks:** Riptide, ZeroFi, GoonFi V2 and BisonFi. [V lite-api.jup.ag/swap/v1/program-id-to-label plus route checks]
- **Jump's prop AMM plus Jupiter** back Securitize's regulated stocks on Solana. [V theblock.co/news/defi/2026-05-05-securitize-taps-jump-and-jupiter-as-it-rolls-out-fully-onchain-regulated-onchain-stocks-400051]
- **Permissioned pools are already live** on Raydium (with Superstate) and on Uniswap v4. [V tradingview.com/news/coinmarketcal:3222a0c44094b:0-raydium-launches-permissioned-pools-for-regulated-assets-23-jul-2026/; cryptobriefing.com/uniswap-unveils-permissioned-pools-for-tokenized-funds-and-equities/]
- **Issuers supply their own liquidity:** Ondo quotes 24/5 plus a weekend session, and Backpack runs its own RFQ. [V docs.ondo.finance/ondo-stocks/off-hours-trading; learn.backpack.exchange/articles/backpack-securities-trading-hours-fees]
- **Leads that didn't check out:** "Standard" and "Retain" were not found (U). Delta Liquidity is a $27k-TVL tool, not a market maker. [V DefiLlama]

**(b) What's missing**
- The long tail. Backpack's HIMS moves 2.1% on a $100k order. [V Jupiter API]
- A perp-hedged vault for passive depositors. I found none (U).

**(c) Size:** at 5–15 bps on at least $199M/day, that is roughly $36–110M a year gross across all market makers (U, my estimate).

**(d) Difficulty:** high. It needs millions in inventory and a hedging venue, and you compete with Jump and the issuers themselves.

**(e) Score: 3/10.**

## T4: 24/7 equity price discovery (perps)

**(a) Who already does it**
- **trade.xyz on Hyperliquid's HIP-3** dominates. [V api.hyperliquid.xyz/info, API]
  - $58.6B of volume in the last 30 days, with a $115B peak month in July.
  - About 98% of all HIP-3 volume. The other HIP-3 equity deployers have delisted.
- **Lighter:** $165M/day. [V mainnet.zklighter.elliot.ai/api/v1/orderBookDetails]
- **Bybit:** added options on stock perps on 17 Sep. [V theblock.co/news/markets/2026-08-28-bybit-launches-24-7-options-on-stock-perpetuals-starting-with-spacex-and-nvidia-413032]
- **On Solana:**
  - Pacifica does $2.1M/day. [V api.pacifica.fi/api/v1/info/prices]
  - Jupiter Perps and Phoenix list crypto only.
  - Drift lost $295M in a hack on 1 Apr. [V api.llama.fi/hacks]
- **a16z's "$117B/month" figure:** I could not find the source (U).

**(b) What's missing**
- No Solana venue does more than $5M/day in equity perps.
- BULK's BIP-1 would let outside teams deploy their own perp markets on Solana, like HIP-3 does on Hyperliquid. It is still in development. [V docs.bulk.trade/bips/bip-1.md]

**(c) Demand:** tokenized-equity perp volume grew from $85B in January to $470B in June. [V The Block link above]

**(d) Difficulty:** very high.
- Liquidity starts from zero.
- Pyth Pro data costs from $2,500/month. [V app.pyth.com/plans]
- Security is a real risk: Ostium lost $23.75M. [V DefiLlama]

**(e) Score: 4/10,** and only if you deploy markets on BULK rather than build a venue.

## T5: Collateral / risk engine

**(a) Who already does it**
- **Kamino:** $22.65M of stock tokens supplied, with LTVs from 73% (SPYx) down to 30%. [V api.kamino.finance/kamino-market/5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua/reserves/metrics?env=mainnet-beta]
- **Jupiter Lend:** $17.9M supplied. [V lite-api.jup.ag/lend/v1/borrow/vaults]
- **Kraken xStocks vaults:** only $1.28M after 11 days. [V genfinity.io/2026/09/14/kraken-xstocks-vaults-kamino-veda-sentora-tokenized-stock-yield/]
- **Venus (BNB Chain):** covers weekend liquidations by hand from a $200k multisig buffer. [V community.venus.io/t/5823]
- **Morpho on Base:** curated by Steakhouse, Gauntlet and Galaxy. [V startupfortune.com/morpho-turns-tokenized-apple-and-nvidia-stock-into-defi-loan-collateral/]
- **Kraken exchange:** 10–30% haircuts on stock collateral. [V blog.kraken.com/product/xstocks/eligible-as-collateral-for-futures-and-margin]
- **Oracles:**
  - Chainlink repeats Friday's close over the weekend and leaves halts and corporate actions to integrators. [V docs.chain.link/data-streams/rwa-streams/handling-market-events]
  - Pyth runs 7-day xStock feeds plus feeds for each token's dividend multiplier. [V hermes.pyth.network/v2/price_feeds]

**(b) What's missing:** a neutral risk layer built for stocks. It would:
- set LTVs by trading session;
- calibrate haircuts on weekend price gaps;
- pause markets automatically on corporate actions;
- run a weekend liquidation backstop hedged on perps.

The pain is proven: one bad pre-market print triggered $57–80M of liquidations on trade.xyz. [V galaxy.com/insights/research/hyperliquid-tradexyz-oracle-liquidations]

**(c) Size is tiny.**
- About $51M of stock collateral across all of DeFi, 84% of it on Solana. [V APIs above]
- For scale, US margin debt is $1.454T. [V finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics]
- The new US venues are barred from margin, so this is offshore-only.

**(d) Difficulty:** high technical work, and the risk curators already own the lenders.

**(e) Score: 5/10.**

## T6: AI-agent brokerage

**(a) Who already does it**
- **Robinhood:** agent accounts with limits and a kill switch. [V robinhood.com/us/en/newsroom/robinhood-is-now-open-to-agents/]
- **Public:** portfolio AI agents. [V prnewswire.com/news-releases/public-becomes-the-first-brokerage-to-introduce-ai-agents-for-your-portfolio-302729050.html]
- **Coinbase:** agent accounts. [V coindesk.com/tech/2026/06/11/coinbase-launches-ai-agent-accounts-that-can-trade-and-spend-on-your-behalf]
- **Alpaca:** raised $135M to be an "agent-first" broker. [V tradingview.com/news/cointelegraph:0faf7b193094b:0-alpaca-raises-135m-to-fund-tokenized-agent-first-infrastructure/]
- **Ondo × Virtuals:** 40k+ agents can trade 430+ stocks. [V finance.yahoo.com/markets/crypto/articles/ai-agents-expand-tokenized-stocks-095650150.html]
- **The leads you named:**
  - xorr and Wallie are 0-star hackathon repos. [V github.com/nickthelegend/xorr-solana]
  - AHagent: not found. Syra: unclear (U).

**(b) What's missing:** only portfolio-level mandate programs, which wallet vendors can easily add.

**(c) Demand:** on-chain agent vaults hold low millions; Almanak has $0.38M. [V DefiLlama]

**(d) Difficulty:** regulation. SEC staff say a wallet or interface avoids broker-dealer rules only if it has no custody, gives no advice and doesn't route orders with discretion. [V ledgerinsights.com/sec-wallets-defi-interfaces-arent-broker-dealers-even-for-tokenized-securities/] An agent that decides trades is adviser territory.

**(e) Score: 3/10.**

## T7: Cross-issuer fungibility

**(a) Who already does it**
- **Jupiter already routes across wrappers.** 81% of $1k SPCXx buy routes went through Backpack's SPCX. [V x.com/minnus/status/2095848292189982836]
- **Raydium SPCX/SPCXx pool:** about $195k of liquidity. [V api.dexscreener.com/latest/dex/search?q=SPCX%20SPCXx]
- **OKX:** one order book per stock. [V okx.com/help/okx-to-list-unified-tokenized-stocks-for-spot-trading]
- **Skew:** a live API that splits a stock order across issuers. [V github.com/skew-labs/xtxc-stock-api]
- **A TradFi coalition** is pushing issuer-sponsored tokens. [V blockonomi.com/major-financial-players-unite-to-build-standards-for-tokenized-stock-trading/]

**(b)–(d)**
- SpaceX has 5 tokens on Solana. [V solanacompass.com/tokens/spacex]
- But price gaps between wrappers are 0.1–1.1% and already arbitraged. [V github.com/DimiMili/stonkpile]
- A router has no moat, and building deep liquidity between wrappers is really T3.

**(e) Score: 2/10.**

## T8: Open slot

**Checked and rejected:**
- **Options and structured products:** exchanges already do this. [V prnewswire.com/news-releases/bybit-expands-fixed-return-dual-asset-product-beyond-crypto-with-xstocks-302833271.html; globenewswire.com/news-release/2026/08/18/3346862/0/en/bitget-launches-fixed-coupon-notes-for-us-stock-rtokens.html] I found no Solana stock-options venue (U).
- **Corporate actions:** Ondo and Broadridge already handle shareholder voting. [V prnewswire.com/news-releases/ondo-finance-brings-shareholder-voting-capabilities-to-tokenized-securities-with-broadridge-302755024.html]
- **Stock baskets:** Ondo launched portfolio tokens on 24 Sep, and Blend launched baskets on 18 Sep. [V tradingview.com/news/coinmarketcal:1965568e8094b:0-the-index-blend-launches-permissionless-onchain-etf-baskets-18-sep-2026/]

**Pick: the infrastructure the new US venues (TSVs) will need.**

**(a) Who is positioning**
- Venues: Securitize (with Jump and Jupiter), Raydium and Uniswap.
- MoonPay is buying North Capital, a registered broker with its own trading venue. [V ledgerinsights.com/moonpay-buys-north-capital-including-ats-for-tokenized-securities/]
- NYSE is exploring this with Blockchain.com. [V theblock.co/news/web3/2026-09-23-blockchain-com-nyse-tokenized-us-stocks-etfs-416176]
- Kaiko and Blockworks could extend into the tooling.

**(b) What's missing**
- A consolidated trade feed across venues.
- Execution scorecards.
- Per-venue monitors for volume caps and halts.
- Tools that show issuers who has tokenized their stock.

I found no one offering a consolidated feed (U; the order is 8 days old).

**(c) Why there is demand**
- Every venue must publish its trades within 10 minutes.
- Caps apply per venue, with a 3-month pause if breached, so trading will spread across venues. [V order]
- Sullivan & Cromwell and Galaxy both note there is no requirement to link venues or consolidate their data. [V sullcrom; galaxy.com/insights/research/sec-innovation-exemption-tokenized-stocks-secondary-trading-nms-permissioned-amm]
- Broker-dealers keep their best-execution duty. [V sullcrom]
- Issuers get 30 days' notice to object to third-party tokens of their stock. [V sullcrom]
- The size depends on how much volume these venues actually attract (U).

**(d) Difficulty:** low capital, but you need to know the regulation well. You may need to buy consolidated-tape data to get the volume figures the caps are measured against (U).

**(e) Score: 6/10.**

## Top 3

1. **T8 + T1: "the tape".**
   - **Start:** a continuous, independent execution-quality index for Solana stock tokens. It runs persistently, breaks down by route, includes weekends and publishes its method. This is the natural upgrade of a fair-price checker.
   - **Then:** sell the consolidated feed plus cap and halt monitoring to the new venues, broker-dealers and issuers.
   - **Why:** regulation creates buyers, nobody is required to consolidate the data, and it needs little capital.
   - **Kill it if:** Kaiko or Blockworks ships a continuous index, or no TSV launches on Solana by about Q1 2027.
2. **T5: a stock-specific risk layer plus a weekend backstop.**
   - **Why:** the pain is proven, and 84% of DeFi stock collateral is on Solana.
   - **Caveat:** the market is about $51M today.
3. **T4, but only as a market deployer on BULK.**
   - **Why:** it is the biggest money pool, and Solana has nothing.
   - **Caveat:** BIP-1 isn't live yet.

**Avoid:** T7, T2 direction 2, T3 and T6.

**Also note:** Switchboard ended oracle support on 25 Sep, naming Kamino, marginfi and Drift as affected. [V cryptoticker.io/en/switchboard-oracle-shutdown-check-solana-defi/]
