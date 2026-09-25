# Product strategy research — 25 September 2026

**Status:** planning and research only. No product code changed for this work.

## Recommendation

Build toward the **market integrity and tradability layer for tokenized equities**: answer three questions at the moment someone considers a trade, then let them act on that answer.

1. **What claim is this token?** Issuer-issued share, third-party token with stated backing, SPV/private-company exposure, or synthetic exposure. Show what is known about rights, backing, transfer restrictions, redemption, and corporate actions.
2. **What is a defensible price now?** Show the source, its age and confidence, current session, issuer or exchange halts, and any gap between independent references and the pool.
3. **Can I get out at my size?** Show a current sell route, estimated proceeds and price impact, round-trip cost, and how much can exit at defined impact levels. Keep on-chain pool depth separate from issuer redemption.

The distinctive product is not a general stock terminal. It is a live **tradability passport** that joins asset terms, market state, and executable exit capacity, then offers a protected route and a shareable receipt. A consumer surface can earn distribution; the product with the strongest revenue potential is the API and monitoring system sold to wallets, venues, issuers, market makers, and launchpads.

This keeps the plan focused on two linked pains: **price confidence across fragmented trading sessions** and **liquidity that looks available on a chart but may not be executable**. Asset rights and backing are essential context for both, not a separate product line to build first.

### Why this is timely

Allium’s study of the 12 months to 18 August 2026 says tokenized equities were Solana’s largest RWA spot-volume category, with 63% of that volume occurring while U.S. exchanges were closed; 45% of Solana equity volume traded on DEXs. It also describes smaller, more frequent RWA trades on Solana. These figures support a useful retail product, but they do not prove durable demand, broad liquidity, or willingness to pay. The report excludes perpetuals from its spot-volume calculation. [Allium’s Solana RWA report](https://www.allium.so/reports/solana-rwa-ecosystem)

Pyth now documents regular, pre-market, post-market, and overnight U.S. equity feed sessions, while its U.S. equity feeds are closed on weekends. So “stocks trade 24/7” does not mean the underlying reference is equally strong 24/7. The product should communicate the current evidence state and lower risk when the source weakens, rather than using one generic open/closed flag. [Pyth market hours](https://docs.pyth.network/price-feeds/pro/market-hours)

## What the research says when read together

| Research signal | What it changes in the product thesis |
|---|---|
| **The SEC’s 17 September 2026 order is narrow and conditional.** It covers defined Tokenized Securities Venues (TSVs) with permissioned access. The order excludes synthetic exposure tokens from its definition of Tokenized NMS Stock; requires a same-rights check for eligible shares; requires issuer notice and an objection window for third-party tokens; requires auditable public contracts, halt synchronization and public disclosures; and allows no primary issuance under this exemption. [Order](https://www.sec.gov/files/rules/exorders/2026/34-106402.pdf), [SEC release](https://www.sec.gov/newsroom/press-releases/2026-90-sec-issues-innovation-exemption-facilitate-trading-tokenized-nms-stock-request-comment) | “Tokenized stock” cannot be one undifferentiated asset category. A machine-readable asset and venue record has real operational value. Do not describe a permissionless DBC launch or a generic stock-linked token as covered by this exemption. A readiness/reporting service can help an eligible venue gather evidence, but it must not promise legal compliance. |
| **The order itself explains an AMM weakness:** pool ratios may set prices without directly considering external prices, and that can create trade-through and quote-information problems. It also recognizes potential dislocation between the pool and underlying stock. [SEC order, discussion of AMM pricing and issuer objections](https://www.sec.gov/files/rules/exorders/2026/34-106402.pdf) | An AMM quote is not proof of a fair share price or of exit capacity. Score actual fills against an explicit reference, show when that reference is weak, and test executable sell depth. This also matters when a stock token is the quote asset for a DBC launch. |
| **Meteora already provides a highly configurable DBC.** Curves, quote assets, fees, graduation and post-graduation liquidity are configuration choices. Its Stocklana brief explicitly asks for equity-aware launch mechanics and tools for issuers to configure and monitor pools. [Meteora DBC docs](https://docs.meteora.ag/developer-guides/dbc), [Stocklana brief](https://hackathons.solana.com/hackathons/stocklana) | Curve configurability by itself is not the product. StockLaunch already offers stock-quoted DBC launches, and Syra advertises a stock desk with Pyth fair value/triangulation plus Meteora DBC and Clawpump launch paths. A generic stock desk or “launch a meme token against a stock” is already crowded. [StockLaunch overview](https://solanacompass.com/news/meteora-opens-token-launches-paired-with-backpack-issued-stocks-via-stocklaunch), [Syra Stock Desk](https://syraa.fun/stocks) |
| **DBC graduation is based on a configured quote reserve.** If the quote asset is a stock token, the USD value of that reserve can move while the token count stays the same. This is an inference from the documented reserve threshold and a volatile quote asset. [DBC docs](https://docs.meteora.ag/developer-guides/dbc) | A DBC companion should model and monitor the quote reserve’s USD value, underlying-price divergence, available quote-token depth, fee accumulation and post-graduation inventory. It should tell creators what the configuration does under different market states; it should not imply a reserve threshold guarantees a healthy market. |
| **Stock-paired pools can make the local token’s price move sharply without moving the underlying stock.** The supplied Bankless article discusses this squeeze dynamic; the SEC order separately identifies pool-ratio pricing and dislocation as concerns. [Bankless article](https://www.bankless.com/read/the-stock-paired-memecoin-squeeze-is-a-lie), [SEC order](https://www.sec.gov/files/rules/exorders/2026/34-106402.pdf) | The launchpad opportunity is an equity-quote risk monitor: max quote exposure, liquidity/impact simulation, quote-price deviation alerts, session-aware fee schedules, and clear disclosure that the new token is not the stock. Only offer controls that Meteora and the token program can actually enforce. |
| **Retain makes LP liquidity visible, but its own product explanation says displayed depth is not total TVL and fees do not guarantee a profitable LP outcome.** [Retain’s article](https://x.com/retainfund/status/2102076215314223358) | “More LP yield” is not a reliable promise. There is room for honest LP analytics that combines executable depth, fees actually earned, inventory drift, pool/underlying basis, and exit cost. This is a second-stage product or a B2B module. |
| **Collateral and structured-product ideas already have builders.** Safix describes private checks for collateral value, eligibility and duplicate pledging; Tessera describes around-the-clock stock-backed lending risk; Note Systems describes autocallable notes with complementary capital-provider and hedge positions. [Safix](https://x.com/safixlabs/status/2101453149647126626), [Tessera](https://tessera-web-delta.vercel.app/blog/introducing-tessera), [Note Systems write-up](https://x.com/nextgenemmanuel/status/2103018187671380089) | Generic “borrow against tokenized stocks” or “put structured notes onchain” is not an open field. The differentiated future role is an independent eligibility, valuation, and exit-risk input that lenders and structured-product venues can consume. |
| **FloatSheets’ thesis emphasizes multiple sources, confidence bands, and reducing risk as data quality weakens. A16z’s article discusses onchain perps as exposure rather than ownership.** [FloatSheets](https://x.com/floatsheets/status/2102465185973956840), [a16z crypto](https://x.com/a16zcrypto/status/2102875903500197915) | Keep ownership tokens, issuer-backed trackers, SPV claims, and perps separate. Perps can be a useful off-hours signal, but a single perp mark should not silently become “the stock’s fair price.” Expose basis, source freshness, and disagreement. |
| **Agent and API interest is visible, but public figures are self-reported.** Syra has described paid API/agent calls; Helwan’s example pairs a paying agent with an off-hours data service. Joe Chalom and other sources make broader agentic-finance arguments. [Syra](https://syraa.fun/marketplace), [Helwan](https://x.com/helwan_mande/status/2101600637926383799), [Joe Chalom](https://x.com/joechalom/status/2102729939543863754) | Make the same market check available as a typed API/MCP tool and metered x402 call. Agents should receive the source state, uncertainty and a bounded action; avoid marketing an autonomous stock-trading agent as the core product. |
| **Options and structured exposure can redistribute liquidity risk.** 0xbeiu and Horinek frame options as a missing link between LP inventory, hedging and holder demand; Note Systems is a concrete structured-note example. These are product theses, not evidence that a deep hedge market already exists. [0xbeiu](https://x.com/0xbeiu/status/2102302414120325274), [HorinekPM](https://x.com/horinekpm/status/2102646947177693565) | There may be a later LP risk-transfer module, but do not issue a yield/option product until there are real counterparties, risk limits, pricing and hedge liquidity. A quality/exitability API can serve this market first. |
| **Nigeria is a real access and distribution angle, but the official IPO workflow is controlled.** The Dangote site says subscriptions, KYC, payment and allotment are handled by SEC-approved receiving agents, issuers, registrars and CSCS; Nigeria’s SEC warns against paying unapproved platforms. [Dangote IPO](https://ipo.dangote.com/), [SEC Nigeria notice](https://www.sec.gov.ng/for-investors/keep-track-of-circulars/dangote-petroleum-refinery-and-petrochemicals-initial-public-offering/) | A Nigeria-first opportunity is an integration for an approved broker/receiving agent: stablecoin-to-fiat collection where permitted, application status, refunds, reconciliation, investor support and reporting. The product would route to authorized infrastructure; it should not claim a stablecoin payment creates a transferable share token. This is a promising separate vertical, not a feature to bolt onto the first equity-market-quality release. |
| **The supplied tokenization progression (money → safer assets → risk assets → collateral → settlement → composability) is a useful direction, not a near-term product spec.** The BlackRock/market, stablecoin, and tokenized-fund examples point toward collateral and settlement. | Build a trustable market record that can later be reused by lenders and settlement applications. Do not start by building a general-purpose RWA bank, lending market, agent economy, and launchpad at once. |

## Product shape and points of difference

### Consumer: “Can I trade this safely at this size?”

Each token page should show:

- **Claim and issuer:** asset type, token issuer, underlying issuer relationship, whether the token confers ownership or economic exposure, available evidence of backing, supply and important transfer restrictions.
- **Market evidence:** quote sources and timestamps; session; confidence/staleness; any disagreement among the underlying feed, issuer reference, token pool, and off-hours markets; corporate actions and halts.
- **Executable liquidity:** buy and sell estimates at the user’s size; likely net proceeds after fees and transfer taxes; exit depth at 1%, 2% and 5% impact; concentration and pool-specific risks.
- **Action:** a protected route or a clear “wait/reduce/avoid” result, with an on-chain receipt explaining the reference used and the realized fill.

Do not collapse “backing,” “market price,” “pool depth,” and “redemption” into one trust score. Show the evidence and its source; a composite grade can be optional and must be explainable.

### B2B: “Can our venue, wallet or launch safely list and operate this market?”

Offer an API/SDK and dashboard for asset onboarding, quote and reserve monitoring, halt/session events, transfer/corporate-action changes, executable market depth, fill-quality measurement, alerting, and machine-readable evidence exports. For DBC partners, add configuration simulation and post-launch monitoring for volatile stock quote assets.

The B2B value is operational: less custom integration work, fewer stale-price or reserve surprises, clearer market quality, and reusable data for users and counterparties. For regulated venues, make clear that the venue remains responsible for its own eligibility and compliance decisions.

### Where the unusual value comes from

The harder-to-copy asset is a longitudinal dataset linking **asset terms + source state + pool state + exact-sized quotes + executed fills + subsequent markouts**. A normal dashboard has prices; this dataset can answer which routes were usable, which references held up in each session, how much could actually exit, and where a launch configuration became unsafe. The public report creates trust and shareability; paid APIs and embedded controls turn the same data into revenue.

ZK proofs can help prove a calculation over a committed dataset, but they do not prove that an indexer saw every relevant fill. Keep the completeness limitation visible. Start with reproducible receipts and signed/committed datasets; use stronger proofs where they actually remove trust assumptions.

## Ranked ideas

| Rank | Idea | User pain and why it can stand out | Business path | Priority |
|---|---|---|---|---|
| **1** | **Tradability passport + market-quality API** | Unifies asset terms, reference quality, session/halts, exact-size exitability and protected execution. Addresses both retail uncertainty and venue operations. | Recurring API/monitoring subscriptions; paid asset onboarding; data licensing; embedded wallet/venue modules. | **Core platform.** Validate buyers before broadening the asset set. |
| **2** | **Equity-aware DBC risk and configuration lab** | Simulates equity quote reserve exposure, dynamic fees and graduation under volatility/session changes; monitors whether the quote reserve still means what the creator thinks it means. Stock-paired DBC is already available, so safety, measurable outcomes and support for issuers are the differentiator. | Per-pool monitoring/setup fee; launchpad/issuer subscription; API and white-label integration. | **Hackathon/distribution wedge.** Do not make stock-token pairing alone the company thesis. |
| **3** | **Nigeria approved-offer access and reconciliation rail** | Smooths cross-border payment and the fragmented application, refund and allotment workflow through licensed market operators. Has strong regional relevance but depends on authorized partners and legal scope. | B2B integration/SaaS, transaction processing through partner rails, issuer/receiving-agent reporting. | **Separate expansion thesis.** Validate a willing licensed partner first. |
| **4** | **LP and market-maker risk console** | Shows net LP outcome, executable depth, inventory drift, source basis and hedge needs rather than advertising fee APR. | Pro subscriptions, desk licenses, liquidity analytics/API. | Add when the core dataset has enough fills and LP positions. |
| **5** | **Collateral eligibility and recovery API** | Lenders need freshness, asset rights, current exit capacity, concentrated ownership, and corporate-action data, not just a price. | Lender integration and monitoring fees. | Later. Generic collateral lending is already being built by Safix/Tessera and others. |
| **6** | **Agent-native protected execution** | Agents can pay per request and trade only when the asset, source and route satisfy a bounded policy. | Metered x402 checks, API plans, wallet/agent licensing. | A distribution interface to idea 1, not a separate autonomous-trading product. |

## Revenue model, in order of fit

1. **B2B recurring software and API.** Charge venues, wallets, launchpads and issuers for monitoring, risk checks, evidence exports, execution-quality reports and integrations. This best matches the product’s repeated operational value.
2. **Per-asset onboarding and ongoing monitoring.** A fixed fee for asset records, venue/route coverage, event mapping and operational alerts. Keep the output evidence-based; do not sell an unearned “approved” badge.
3. **Data licensing and analytics.** Sell fill-quality, market-session, exit-depth and LP-outcome datasets to market makers, issuers, allocators and research desks, subject to data rights.
4. **Metered agent/API use.** Offer free basic calls for developers and x402/USDC pay-per-call for higher-frequency simulation, event checks and protected transaction construction. Syra’s post suggests there is early experimentation, but its numbers are self-reported and not proof of market size.
5. **Consumer Pro tier.** Alerts, portfolio exit checks, corporate-action readiness and saved risk policies. Keep the core safety verdict free to support adoption.
6. **Launchpad configuration and monitoring.** Fixed onboarding or subscription revenue is healthier than depending on speculative launch volume. A share of DBC fees may supplement revenue, but it creates incentive and trust conflicts if the platform grades the pools it earns from.
7. **Execution/referral fees.** Possible later via an integrated route, but disclose conflicts and preserve an independent report that is not paid to favor a venue.
8. **Liquidity provision, lending, or structured products.** These could earn market-making, lending or product fees, but add capital, credit, hedging, and regulatory risk. Do not use them as the first revenue plan.

## Validation plan before implementation

1. **Replay the market, not the pitch.** Use a representative set of xStocks and PreStocks across regular, extended, overnight and weekend periods. Measure source freshness/disagreement, exact-size buy/sell quotes, slippage, round-trip cost, realized fill gap and markouts. Separate issuer-platform fills from DEX fills and spot from perps.
2. **Test the tradability passport with users.** Put the same asset into a simple page for retail traders, market makers, wallets and launchpad teams. Ask them to make a decision and explain which evidence changed it. Test whether “how much can I exit?” is more useful than another chart or premium/discount board.
3. **Get paid-design-partner evidence.** Interview wallet/venue/issuer/LP teams and seek two or three pilot commitments with a defined buyer, data input, operational job and paid renewal condition. Do not use hackathon interest as B2B validation.
4. **Run DBC configuration scenarios.** Model stock-quote volatility, shallow reserve, launch spikes, market reopen gaps, fees and graduation. Confirm exactly which settings are changeable, which are immutable, and which controls can be enforced by Meteora DBC, Token-2022 hooks, or an off-chain monitor.
5. **Confirm data rights and the reference policy.** Establish whether feed, issuer, exchange, perp and venue data can be stored, compared, displayed and redistributed. Decide what happens when sources disagree or go stale. A single perp venue must not silently replace the underlying equity reference.
6. **Validate legal structures with qualified counsel and partners.** Classify issuer-issued shares, third-party wrappers, SPVs, private-company interests and synthetic products separately. For Nigeria, identify an SEC-registered/approved receiving agent or CMO before modeling a live IPO flow.

Suggested first success measures: % of checks with a current independent reference; observed false-block rate; execution improvement versus unguarded route; exit-capacity estimate versus actual sale; API call-to-pilot conversion; and paid renewal by at least one venue or wallet. TVL, launches, and token holder counts alone are not success measures.

## Existing Rehearsal ideas — preserved and updated

The previous research list remains part of this plan. Nothing below is being discarded; the newer research changes its packaging and adds competition/context.

### Existing opportunities to carry forward

- Open Rule-605-like execution benchmark for tokenized-stock fills, with effective spread, price improvement and markouts by venue, router, size and session.
- Exit-capacity map: executable sell size at 1%, 2% and 5% price impact, compared with concentrated wallet holdings.
- Pre-IPO IPO-conversion discount calculator, including deadlines, conversion path, lock-up and liquidity cost.
- Public fill dataset comparing realized trades with Pyth/issuer marks, with a clear reference source and completeness statement.
- Calibration of reference confidence and tracking error by session; use stale/disagreeing sources to tighten size limits or pause.
- LULD-style shared circuit breaker and halt synchronization; session-aware opening/closing crosses; fair-value intents; guarded execution across routes.
- Verifiable pre-IPO marks when login-gated market evidence and data rights permit it.
- Reproducible or ZK-proven reports after data completeness is addressed.

### Already done in the earlier landscape; do not claim as novelty

- A bad-fill guard; a premium/discount board; implied valuation; scaled-UI multiplier support; and standalone price checks already exist in the market or current Rehearsal work.
- Prior art includes Lighthouse assertions, Jupiter min-out/Ultra, Jito DontFront, scrip, holdfill and Closing Bell. Do not claim “a swap guard” alone as new; the case is independent reference pricing, cross-route protection, live exit sizing, and a public recomputable record.
- Basic “stock desk” aggregation and stock-paired DBC launches now have visible competitors/products. The differentiator must be measured exitability, market-state risk policy, asset evidence, execution proof, or integrations.
- Generic tokenized-equity collateral and structured notes have active teams. Rehearsal’s strongest role there is a trusted data/control layer, not another lending/notes venue.

## Current build assessment — saved for the end as requested

The current build is a strong first wedge for the platform thesis, not a product that needs to be thrown away. Its best foundation is the link between exact-sized Jupiter quotes, Pyth/issuer references, realized execution reports and an on-chain guard. The repo also contains work on circuit breakers/halt relay, fair orders and crosses, pre-IPO comparisons, wallet exit checks, Blinks, a proof for a frozen report snapshot, and a new signals/agent layer. These match the two chosen pains closely.

The repository’s own submission notes say the on-chain guard and order program are on devnet, the mainnet deployment is still pending, and Pyth Pro’s 24/7 references require a paid key. That is a meaningful go-to-market limit: integrations and safe execution need a production deployment and clearly supported reference policy before the B2B story is sold as live.

Recent uncommitted workspace changes add xStocks session, reserve and corporate-action checks, a Lighter perp reference, and agent-oriented trade functions. That is directionally useful. The existing agent module describes REST `/api/v1` and MCP endpoints, but the current API route tree does not expose those routes yet. Also, the off-hours perp mark is one market signal, not an independent guarantee of the stock’s fair price; source disagreement, liquidity and data rights need to be explicit. The current asset model still needs a structured rights/backing/redemption record to become the full tradability passport.

The biggest product gap is now packaging and distribution: no proven paying venue or wallet integration, and the consumer trust surface is not yet the same as a reusable market-quality service. Start with a public, shareable tradability passport and a pilot API for a wallet/venue; use DBC monitoring as an early integration surface. Keep the core guard and report central.

This review was read-only. Tests and live integrations were not rerun.

## Source coverage and limits

### Primary sources checked

- [SEC Innovation Exemption order, Release 34-106402](https://www.sec.gov/files/rules/exorders/2026/34-106402.pdf)
- [SEC tokenized-securities statement](https://www.sec.gov/newsroom/speeches-statements/corp-fin-statement-tokenized-securities-012826-statement-tokenized-securities)
- [Meteora DBC documentation](https://docs.meteora.ag/developer-guides/dbc)
- [Official STOCKLANA brief and timeline](https://hackathons.solana.com/hackathons/stocklana)
- [Pyth Pro market-hours documentation](https://docs.pyth.network/price-feeds/pro/market-hours)
- [Allium Solana RWA report](https://www.allium.so/reports/solana-rwa-ecosystem)
- [Dangote IPO information site](https://ipo.dangote.com/) and [SEC Nigeria warning](https://www.sec.gov.ng/for-investors/keep-track-of-circulars/dangote-petroleum-refinery-and-petrochemicals-initial-public-offering/)

### User-supplied material reviewed

Reviewed X posts/articles from Token Relations, Retain, Safix, Grace Jhayy, NextGen Emmanuel, FloatSheets, B. Holden, Joe Chalom, 0xbeiu, Superteam India, Surge, Brian in Crypto, Nonso Obiefule, Base Insider, Minnus, Helwan Mande, Matthew Canham, OpenStocks, HorinekPM, a16z crypto, and the supplied Syra post; also reviewed the supplied Frictionless Capital article. X claims and company articles are treated as product claims or hypotheses unless independently corroborated. The accessible themes included LP transparency and IL risk, private collateral eligibility, structured risk transfer, multi-reference confidence policy, agent-paid data, public-company/utility pairings, stock-token quote pools, and Nigeria IPO access.

The other readable sources reinforce the same product decisions: Token Relations and Grace Jhayy provide ecosystem context rather than independent demand proof; B. Holden’s verifiable-computing thesis supports transparent evidence but is not itself a customer problem; Superteam India’s list and metrics are directional; Surge’s public-company/utility-token pairing is an experiment that needs clear non-affiliation labels; OpenStocks’ private-share and backing statements need issuer/custody verification; Base Insider and Minnus/Frictionless discuss tokenization and stock-pair distribution, but their market-volume and execution claims should not be used as underwriting data without primary records; Matthew Canham’s agent-decision framing is an interaction idea, not a substitute for explicit trading policy. Nonso Obiefule’s Dangote post is a lead about subscription/payment activity, not proof that the resulting interest is a freely transferable on-chain share. The supplied SEC critique from Brian in Crypto was checked against the order itself; the order controls the legal description in this memo.

Some X URLs in the prompt end in visibly incomplete status IDs (including the supplied `okay_lets_ride`, `capitalmarkets`, `starplatinum_`, `raoulgmi`, `blackrock`, `bankless`, `defillama`, `rohonchain`, `sol_nxxn`, `zeusrwa`, `claimfomo`, `top7ico`, `a1lon9`, `mossai_official`, and `0xsammy` links). The supplied `mert` post also could not be reliably retrieved. Those exact posts are not used as evidence. The AfriFlux page did not load in the research browser; its linked post is treated only as a pointer to an IPO explainer. Resend complete links for a source-by-source pass on these items.
