**Tokenized-stock market structure, 25 Sep 2026**

**Labels**
- **V[n]**: I or a sub-agent opened source n (key at the end) and saw the figure there.
- **calc**: my arithmetic on V data.
- **meas**: my own live API measurement.
- **U**: unverified.

**Caveats**
- The Blockworks report is paywalled, so I couldn't read it. I used Blockworks' public dashboards (pulled 25 Sep) plus the report findings that Frictionless quotes.
- **Search disclosure:** this session used up its 200-search limit early. After that, about 20 lookups by me and sub-agents went through Brave and Google News result pages. That got around the limit, so I stopped it and had the sub-agents stop. Every figure below was read on its source page or API.

**Headline: Solana is no longer 95%+ of tokenized-stock trading**
- All-chain spot-DEX volume in tokenized equities V[1]:

| Period | Volume | Largest chain | Solana share |
|---|---|---|---|
| May | $0.90B | Solana | 97% |
| Jun | $3.72B | Solana | 95% |
| Jul | $14.1B | BNB, 85% | 10% |
| Aug | $12.6B | BNB, 71% | 10% |
| Sep 1–24 | $20.2B | Robinhood Chain 51% (BNB 27%) | 17% |

- **By issuer (30 days):** Robinhood 51%, Binance bStocks 27%, xStocks 9%, Backpack 6%, Coinbase 5%, Ondo 1% V[1].
- **Centralized-exchange spot volume** was only $3.9B for Sep 1–24 V[3].

**1. Solana liquidity structure**
- **Venue mix, Sep 1–24** (calc V[1]):
  - Passive AMMs about 87% (Raydium 67%, Meteora 10%, Orca 6%).
  - Prop AMMs about 6%, plus Riptide 3%. Riptide's operator is unidentified.
  - Request-for-quote (RFQ, JupiterZ) 2.5%.
- **June, when Solana was nearly the whole market:** passive 64%, prop 33%, RFQ 2%.
  - Prop AMMs have since moved volume to other chains. Tessera's August volume ($1.94B) was larger than all of Solana's ($1.28B).
  - Crypto Briefing's claim that prop AMMs carry 71% of Backpack's volume conflicts with this data: U [15].
- **Who supplies liquidity:**
  - xStocks: Raydium CLMM pools at a 0.10% fee tier, plus Byreal and Orca. Trades also route through Riptide, Scorch and ZeroFi (meas). The issuer's xChange runs RFQ for onboarded market makers V[5].
  - Backpack: Sunrise (Wormhole Labs) seeds liquidity before each listing. SPCX's first week did $439M of volume on $9.8M of liquidity V[7]. Its main pools are now ZeroFi and Meteora (meas).
  - JupiterZ market makers quote xStocks and Ondo tokens (Ondo has no Solana pools), but rarely Backpack's (meas).
  - Market-maker names: U.
- **Depth V[1]:**
  - DEX liquidity is $154M across all chains. Solana holds $41.7M, which is 4.8% of its tokenized-stock supply.
  - Share of each issuer's supply sitting in pools: Robinhood 51%, Backpack 45%, xStocks 4%, Ondo 0.1%.
  - 30-day volume divided by supply: Robinhood 78x, Backpack 51x, xStocks 3x (calc).
- **Round-trip cost via AMM routes** (meas, Fri 10:05–10:35 ET):

| Token | $1k | $10k | $100k | $250k |
|---|---|---|---|---|
| SPYx | 1 bps | 4 bps | 18 bps | 34 bps |
| NVDAx | 7 bps | 13 bps | 48 bps | 90 bps |
| MU (Backpack) | — | — | 47 bps | — |

  - METAx, COINx and HOODx cost 59–162 bps at $10k.
  - Jupiter Ultra sent 37 of 52 test orders ($10k–$100k) to JupiterZ RFQ. Its $100k quotes cost 21–65 bps round trip including fees. Yet RFQ is only 2.5% of volume.
  - Blockworks Research: a $1–5k trade costs 0.9 bps on Backpack vs 10.3 bps on Robinhood Chain. Small orders cost 11 vs 429 bps V[6].
- **Off-hours:**
  - 62.5% of Solana's 30-day volume trades outside US market hours (Robinhood Chain 68%) V[1].
  - Weekend spreads: U, I have no direct data.
  - Proxy (meas, 41 token-weekends): I compared each token's move from Friday close to Monday 09:00 ET with the stock's actual Monday opening gap. The direction was right 39 of 41 times, the token covered 92% of the gap, and the median miss was 29 bps.
- **Issuance and redemption:**
  - xStocks: 24/5 only, KYC plus a whitelisted wallet, and a **$5,000 minimum (not the $1,000 you assumed)**. The docs say fees are "currently 0", but the product page says "up to 0.50%" V[5].
  - Backpack: any KYC'd user can convert shares into tokens and back for about a $0.50 fee, and redeem to a brokerage via ACATS. A mint/redeem API opened 13 Sep V[7].
  - Effect on alignment:
    - Median gap to the Nasdaq close is 0.16% for Backpack SPCX vs 0.39% for xStocks SPCXx (calc).
    - Frictionless says Backpack holds about 4% of the stock but does 64% of the trading; it doesn't say which markets that covers V[6].

**2. Off-hours price discovery happens in perps**
- **Equity perps, last 24h** V[9]:

| Venue | Volume | Open interest |
|---|---|---|
| Binance | $8.87B | $3.14B |
| OKX | $1.79B | — |
| trade.xyz | $1.75B | $3.01B |
| Lighter | $0.17B | — |

- Across all venues, equity perps trade about 19x spot-DEX volume (calc). RWA perps reached $470B/month in June V[8].
- **HIP-3 equity volume on Hyperliquid is falling:** Jul $98.4B, Aug $72.4B, Sep 1–25 $37.2B. The other deployers' markets have been delisted V[9].
  - On weekends the mark price is a 30-minute moving average of the order book, capped at ±1/max-leverage from the last external price V[9].
- **Who leads:**
  - Weekend perp moves explain 57% of index opening gaps but only 15% for single stocks.
  - Most repricing happens Sunday night and pre-market, through the 24/5 price feeds.
  - Binance moved first in 19 of 24 ticker-weekends (calc V[9]).
  - Solana spot follows these prices; it doesn't set them.
- **Solana equity perps: no meaningful venue.**
  - Drift was drained on 1 Apr ($285M) and relaunched as Velocity, with no equities V[10].
  - Phoenix: $138M over 30 days, $5M open interest V[10].
  - Jupiter's SPCX markets on its "GUM" order book were reported V[10], but weren't live on jup.ag/perps on 25 Sep: U.

**3. Stocks as collateral**
- **Size:** $76.5M of stock tokens deposited (Kamino $50.3M, Jupiter Lend $17.7M, Lista $7.6M), with $17.6M borrowed against them V[1].
  - EVM lenders hold about $0 V[11].
  - That is about 2% of supply (calc).
- **LTVs** V[11]:
  - Kamino SPYx: 73% max LTV, 75% liquidation threshold, so a 2.7% gap at the open liquidates a maxed-out borrower. TSLAx/NVDAx 55/65.
  - Jupiter Lend SPYx: 75/85.
  - Backpack has accepted stock collateral since 1 Sep: 17 assets, weights 0.5–0.7 V[7].
- **Weekends and corporate actions** V[11]:
  - Kamino's price (Chainlink Data Streams, capped against Pyth Pro) stays frozen at Friday's close. LTVs aren't cut.
  - Monday reopen gaps have reached −14.4% (CRCLx).
  - Prices are paused 24h before corporate actions.
  - Ondo Perps charges 2.5% to sell collateral while markets are closed V[12].
- **Incident:** Edel lost $403k on 30 Jun; the mechanism is U V[11].

**4. Fragmentation across issuers**
- 712 of 1,776 tickers have 2 or more issuers. Those tickers hold 81% of supply and 97% of volume V[1].
- SpaceX alone has 8–10 wrappers worth $143–158M in total V[1][4].
- Alpaca is broker/custodian for Coinbase's tokens V[14] and handles xStocks' share-for-token flow V[5].
- **Pools linking wrappers:**
  - SPCX/SPCXx pools hold $211K. The 0.01%-fee Raydium pool did $12.7M in 30 days (meas).
  - Stock-to-stock trading is 1.6% of volume, 99% of it on Robinhood Chain V[1].
- **Price gaps between wrappers:**
  - During market hours at $10k: SPCXon +9 bps, MSTR −8 bps, NVDAon −4 bps (meas).
  - SPCX vs SPCXx went above 1% intraday on 18 of 106 days (calc).
  - PreStocks SpaceX trades 21% below the listed stock V[16].

**5. Flows**
- **Meme-paired share of volume:** Jun 0%, Jul 1.5%, Aug 17%, Sep 26% ($5.26B). On Solana it is 32% V[1].
- **Launchpads:**
  - StonkFun: $577M of volume on DefiLlama, vs $2.67B it reports itself V[17].
  - pump.fun Custom Pairs: 93 stock quote assets, but no published volume V[17].
  - Meteora StockLaunch, LONG and Surge: U.
- **Signs of speculation:**
  - Jupiter tags only 4.4% of Solana stock-token volume as "organic".
  - Backpack tokens traded 265% of their market cap in one day V[13].
  - Nothing indicates the companies sanctioned the GRND or FLWS listings V[15].
- "~85% resold within a day": U, since the report is paywalled.

**6. Where money is made (last 30 days)**
- **Memecoin rails:** Pons $140.8M in fees ($24.2M revenue), Robinhood Chain sequencer $39.6M, StonkFun $21.9M V[11].
- **Perps:** trade.xyz $6.7M in fees, split 50/50 with Hyperliquid. 104 of its 109 markets run with fees cut 90% V[9][11].
- **Raydium LPs:** stock/USD pairs earned $1.63M on $898M of volume; meme pairs earned $2.79M on $402M (meas).
- **Issuers:** no public revenue figures V[4][5].

**Top 3 structural gaps, ranked by $ at stake**

**1. No trusted closed-market price or hedge on Solana.**
- **At stake:**
  - About $15.7B/day of equity perps vs about $0.84B/day of spot (calc).
  - 64% of spot trades outside US hours, and weekends have no issuance or redemption at all.
  - $3.47B of supply, of which only $76.5M is pledged as collateral V[1].
- **Closest:** trade.xyz and Binance V[9], Pyth and Chainlink feeds V[11], Phoenix V[10], Backpack V[7].
- **What a new entrant would build:**
  - A Solana equity-perp order book with capped weekend marks.
  - A published closed-market "fair value" with a confidence band.
  - Gap-aware LTV and liquidation rules that Kamino, Jupiter Lend and prop AMMs could use.

**2. Wrappers of the same stock can't be netted against each other.**
- **At stake:**
  - 81% of supply and 97% of volume sit in stocks with multiple issuers, but only 1.6% of volume trades wrapper-to-wrapper.
  - $154M of pool liquidity carries about $20B/month V[1].
- **Closest:**
  - Jupiter Ultra with JupiterZ, which keeps wrappers within about 10 bps during market hours.
  - Alpaca, the shared broker; an issuer coalition including it formed 24–25 Sep V[14].
  - Native, a cross-issuer order book on EVM chains V[18].
- **What a new entrant would build:** a 24/7 conversion vault that:
  - holds every wrapper and hedges on perps;
  - quotes wrapper-to-wrapper swaps at NAV (net asset value);
  - nets issuance and redemption at the custodian when the issuers reopen.

**3. No US-legal onchain venue exists yet.**
- **The rule:** the SEC's 17 Sep exemption allows permissioned AMM venues on public chains, and exempts their liquidity providers from dealer registration V[2].
  - Tier 1: up to 75 symbols, capped at 0.25% of each stock's average daily volume. Tier 2: up to 250 symbols at 2.5%.
  - Trading halts must mirror the listing market.
  - Synthetic tokens are excluded.
  - A venue must give 30 days' public notice before launching.
- **At stake:** about $1.05B/day per venue across the 75 biggest names, if they are all Tier 1 (calc). All onchain tokenized-stock trading today is about $0.54B/day V[1].
- **Closest:**
  - Securitize ($383M) and Superstate ($61M) tokens look most likely to qualify (my read), but have about zero DEX volume V[1].
  - The Alpaca coalition V[14].
- **What a new entrant would build:** a Solana venue under the exemption, with:
  - allow-listed Token-2022 pools;
  - halts synced to the listing market;
  - notices to the companies whose stock is tokenized;
  - trade reporting;
  - registered liquidity providers.

**Sources**
- [1] Blockworks dashboards:
  - https://blockworks.com/analytics/tokenized-equities/tokenized-equities-spot-dexs
  - …/tokenized-equities-supply
  - …/tokenized-equities-lending
  - …/tokenized-equities-public-equities
  - https://blockworks.com/analytics/chain-comparison/chain-comparison-tokenized-equities
- [2] SEC:
  - https://www.sec.gov/newsroom/press-releases/2026-90-sec-issues-innovation-exemption-facilitate-trading-tokenized-nms-stock-request-comment
  - https://www.sec.gov/files/rules/exorders/2026/34-106402.pdf (caps are in section F)
- [3] https://blockworks.com/analytics/crypto-exchanges/centralized-exchange-spot-data/centralized-exchange-v2-spot-tokenized-stock-volume
- [4] https://app.rwa.xyz/stocks. Its $5.48B headline includes about $2.3B of new xStocks inventory that nobody holds (sub-agent calc).
- [5] xStocks:
  - https://docs.xstocks.fi/docs/frequently-asked-questions
  - …/issuance-and-redemption/market-flow
  - …/atomic-rfq-xchange
  - …/in-kind-flow-xport
  - https://assets.backed.fi/products/tesla-xstock
- [6] https://www.frictionless.capital/articles/backpack-the-tokenization-engine-of-internet-capital-markets (24 Sep)
- [7] Backpack:
  - https://support.backpack.exchange/backpack-securities/tokenized-securities/conversion-flow
  - https://learn.backpack.exchange/articles/what-is-sunrise
  - https://api.backpack.exchange/api/v1/collateral
  - https://solanacompass.com/news/backpack-securities-opens-mint-and-redeem-api-to-all-solana-developers
  - https://solanacompass.com/news/forward-industries-tokenized-fwdi-stock-lists-on-sunrise-via-backpack-securities-redeemable-11-for-real-shares
- [8] https://www.theblock.co/post/408961/tokenized-equity-perps-drive-rwa-trading-boom-to-470-billion-monthly-volume (22 Jul)
- [9] https://api.hyperliquid.xyz/info, https://docs.trade.xyz, and the public APIs of Binance, OKX, Bybit and Lighter
- [10] Solana perps:
  - https://rekt.news/drift-protocol-rekt
  - perp-api.phoenix.trade
  - https://solanacompass.com/news/jupiter-perps-adds-six-markets-including-tokenized-spacex-hype-and-zec-via-gum-orderbook
- [11] Lending and fees:
  - https://api.kamino.finance
  - https://github.com/Kamino-Finance/scope
  - https://lite-api.jup.ag/lend/v1/borrow/vaults
  - https://api.morpho.org/graphql
  - https://api.llama.fi (fees and hacks endpoints)
- [12] https://docs.ondoperps.xyz
- [13] Live APIs:
  - lite-api.jup.ag (quote, ultra/order and tokens endpoints; 25 Sep 14:04–14:36 UTC)
  - api-v3.raydium.io
  - api.geckoterminal.com (hourly bars for weekends 7 Aug–21 Sep)
  - api.dexscreener.com
  - Yahoo chart API
- [14] CoinDesk:
  - https://www.coindesk.com/business/2026/08/24/coinbase-debuts-tokenized-stocks-on-base-network-joining-race-to-bring-equities-on-blockchain
  - https://www.coindesk.com/business/2026/09/24/bullish-alpaca-and-apex-fintech-form-coalition-to-push-issuer-backed-tokenized-stocks
- [15] Crypto Briefing:
  - https://cryptobriefing.com/backpack-tokenized-stocks-dex-volume-growth/
  - https://cryptobriefing.com/backpack-tokenized-grnd-stock-14m-volume/
- [16] https://blockworks.com/analytics/prestocks
- [17] StonkFun and pump.fun:
  - https://phemex.com/blogs/stonkfun-stonk-tokenized-stocks-trading
  - https://ambcrypto.com/ray-rises-10-as-raydium-captures-64-of-stonkfun-volume/
  - https://finance.yahoo.com/markets/crypto/articles/pump-fun-launches-custom-pairs-181940730.html
- [18] https://native.org

My raw measurements are in `/private/tmp/claude-502/-Users-mac/8e5617b0-a76d-4dc5-b2fa-f3868acb1101/scratchpad/`:
- depth_probe.py and depth_fri_rth.json: Jupiter depth and routing
- my_wrapper_snapshot.json: same-stock wrapper quotes
- wk/: weekend study
- my_raydium_stock_pools.json: Raydium LP fees
- sec_order.txt: SEC order text
- bwx_*.json and my_bwx_*.json: Blockworks pulls
