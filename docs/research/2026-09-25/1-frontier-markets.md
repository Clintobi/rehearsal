Frontier-market capital markets on Solana: deep-dive, 25 Sep 2026

Legend: [V] means I checked it this session at the URL given. [U] means it comes from memory or a secondary source and I didn't re-check it. My web-search quota ran out partway through, so a few side items are [U].

## 1) Regulation and a plausible legal structure

**Nigeria**
- **ISA 2025** (signed 25 Mar 2025): digital assets are now securities. The SEC can license VASPs, demand white papers and cap retail crypto exposure. [V] https://techcabal.com/2025/05/09/investments-and-securities-act-nigeria-2025/
- **SEC proposed rules** ("Digital and Virtual Asset Operations, Custody and Markets", 20 Aug 2026; comments closed 3 Sep). [V] https://www.mariblock.com/stories/nigerias-sec-proposes-stricter-rules-for-digital-asset-firms and https://www.lexworthlegal.com/nigerias-evolving-digital-asset-ecosystem-examining-the-security-and-exchange-commissions-sec-proposed-comprehensive-framework
  - Six licence classes, including an RWA Tokenisation Platform and a Digital Asset Offering Platform.
  - Minimum capital runs from ₦200M to ₦2B: ₦500M for tokenisation platforms, ₦2B for exchanges and custodians. Operators also need a fidelity bond worth 25% of their capital.
  - **Foreign-currency stablecoins can't be listed or held by consumers without SEC approval.** USDC-funded flows like NectarFi's would need that approval.
  - The rules apply to anyone "targeting Nigerian investors… digitally".
  - They follow a presidential executive order on virtual assets.
- **Sandboxes** [V] https://home.sec.gov.ng/fintech-and-innovation-hub-finport/registered-fintech-operators/
  - The Regulatory Incubation cohort includes:
    - NASD OTC's "NASD Digital Securities Exchange" (since 2023)
    - Hashgreed and Trovotech (real-world-asset tokenisation)
    - HXafrica and DreamCity (real-estate tokenisation)
    - Blockvault (custody)
    - Wrapped CBDC/cNGN (stablecoin), admitted 29 Aug 2024
  - ARIP (the fast-track programme) lists only Busha and Quidax, both as exchanges. Chaka and Bamboo are SEC-registered fintech operators.
  - ARIP requires Nigerian incorporation, a physical office and a resident CEO. [V] https://home.sec.gov.ng/fintech-and-innovation-hub-finport/finport-programs-ri-and-arip/
- **Dangote IPO**
  - In June 2026 the SEC stopped promotions of the IPO before it was approved and ordered 24-hour refunds. [V] https://www.fsxbusiness.com/nigerias-sec-blocks-unapproved-promotion
  - The 14 Sep circular says to use approved channels only and never mentions tokens or stablecoins. [V] https://home.sec.gov.ng/for-investors/keep-track-of-circulars/dangote-petroleum-refinery-and-petrochemicals-initial-public-offering/
  - One newsletter counts only 3 of the 55 approved channels (Bamboo, Flutterwave, Paga) as running digital-asset operations. [V] https://buildersinfintech.substack.com/p/sd-12-the-ipo-came-but-stablecoins
- **NGX tokenization programme:** [U], I couldn't confirm one exists.
- **cNGN** is live on Solana (SPL mint 3jiqwBQVRC5zRwHyqvnkQurebJ5RNxg3F5fXMwaxgkv8), plus Base, Ethereum, BNB, Polygon, Lisk, Celo, Asset Chain and Bantu. [V] https://docs.cngn.co/guides/contract-addresses.md. Its supply and liquidity are [U].

**Elsewhere**
- **Kenya:** the CMA sandbox has run since 2019. Its listed participants are crowdfunding firms and CDSC, with no tokenised securities. [V] https://sandbox.cma.or.ke/. VASP Act 2025 [U].
- **South Africa:** Luno sells 60+ tokenised US stocks and ETFs for rand. [V] https://www.luno.com/stocks. Kotani Pay is an FSCA-registered provider, #53594. [V] https://kotanipay.com. The crypto-as-financial-product regime has applied since 2022 [U]. **ZARsc on Solana [U]: I couldn't confirm it.**
- **Ghana:** 2025 VASP law under the Bank of Ghana and SEC [U].

**Legal structure (two stacks)**
- **Onshore, for Nigerian buyers in naira:**
  - A licensed broker or fund manager buys NGX shares, FGN bills or money-market fund units.
  - A licensed custodian holds them in CSCS for a bankruptcy-remote trust or nominee.
  - Holders get Token-2022 tokens with a KYC transfer hook, settled in cNGN.
  - You either register as a tokenisation/offering platform through ARIP, or act as the tech provider to sandboxed partners (Trovotech/Hashgreed, Blockvault, NASD DSE).
  - There is no FX leg.
- **Offshore, for diaspora and global buyers in USD:**
  - An SPV (Mauritius, ADGM or Cayman) brings in USD through an authorised dealer bank. This gets it a Certificate of Capital Importation (CCI), the legal right to repatriate [U].
  - It buys through a Nigerian broker, with a global custodian and a local sub-custodian.
  - It issues tokenised depositary receipts under Reg S and EU/UK private-placement exemptions. No US persons, and no Nigerian residents without SEC approval.
  - Redemption: burn the token, sell on NGX, repatriate under the CCI, pay out USDC.
  - Copy Ondo's independent security agent, which holds a first-priority lien for tokenholders. [V] https://ondo.finance/global-markets
  - Never route repatriation through the P2P USDT market; that would likely breach FX rules [U].
- **Compare with DPRI (the Dangote on-chain token):**
  - It "does not tokenize the equity"; it's a receipt. [V] https://solanacompass.com/news/africas-biggest-ipo-opens-stablecoin-subscription-on-solana-via-nectarfi
  - GetEquity's own footer says "GetEquity Inc. is not registered with any regulatory agency or body". [V] https://getequity.io
  - MyStocks nevertheless lists GetEquity as a "supporting broker". [V] https://mystocks.africa/dangote-ipo/how-to-invest
  - Treat the legal basis of the receipt model as unproven.

## 2) Players and traction

**US and global assets for Africans (crowded)**
- **Bamboo:** 2.3M+ users, $600M+ in trades, SEC-registered, uses DriveWealth, and was a Dangote channel. [V] https://investbamboo.com
- **Trove:** 400k+ users, with Alpaca and DriveWealth as custodians. [V] https://trovefinance.com/
- **Chaka:** chaka.com now redirects to Hisa. Hisa trades Nigerian stocks through Chaka's licence, Kenyan stocks through RiseVest East Africa, and US stocks through Alpaca. [V] https://hisa.co/. Risevest's own numbers [U].
- **xStocks** (Backed/Kraken): $40B+ volume. It excludes only the US, UK, Canada, Australia and sanctioned countries, so Nigeria is open. [V] https://xstocks.fi
- **Ondo Stocks:** on Solana. Nigeria, Kenya, Ghana and South Africa are neither prohibited nor restricted. [V] https://docs.ondo.finance/ondo-stocks/eligibility
- **Whole tokenised-stock market:** $5.48B, 3.92M holders. xStocks has $2.9B and Ondo $870M. [V] https://app.rwa.xyz/stocks

**African assets for diaspora and global buyers**
- **GetEquity:** its own site says 20k+ investors and ₦1B+ in deals. [V] https://getequity.io. The press says 22k users and "$2B", which looks like a naira/dollar mix-up. [V] https://www.digitaltoday.co.kr/en/view/104851/dangote-refining-record-ipo-stablecoin-subscription-on-solana
- **NectarFi** (Superteam Nigeria): $7M volume, 1,000+ users, $170k pre-seed in Apr 2026. [V] (Solana Compass link above)
- **Daba and MyStocks:** already take diaspora USD into Dangote with no BVN or CSCS account needed, through a licensed broker or omnibus account. [V] https://dabafinance.com/en/dangote-ipo
- **Sandbox tokenisers** (Hashgreed, Trovotech, HXafrica, DreamCity): real estate and RWAs, no traction data found.

**Payment rails**
- **Yellow Card:** $10B+ volume, 60+ countries. [V] https://yellowcard.io
- **LemFi:** 1M+ customers, regulated by FCA, FinCEN and FINTRAC, no investing product. [V] https://lemfi.com
- **Afriex:** 30+ countries, no investing product. [V] https://www.afriex.com
- **Lume, Mansa, Ownify:** I couldn't verify any tokenised-securities activity [U].

## 3) Demand

- **Crypto adoption:** Nigeria is #6 in Chainalysis's 2025 index, with $92.1B received (Jul 2024 to Jun 2025). Sub-Saharan Africa received $205B, up 52%. [V] https://www.chainalysis.com/blog/2025-global-crypto-adoption-index/ and https://www.chainalysis.com/blog/subsaharan-africa-crypto-adoption-2025/
- **Remittances to Nigeria:** $22.1B in 2024 and $22.8B in 2025. Kenya: $5.0B in 2024. [V] https://api.worldbank.org/v2/country/NGA;KEN;GHA;ZAF/indicator/BX.TRF.PWKR.CD.DT?format=json&date=2021:2025
- **NGX:** market cap ₦131T in Apr 2026 (about $90–100B). The All-Share Index crossed 200,000 in Mar 2026. [V] https://en.wikipedia.org/wiki/Nigerian_Exchange_Group
- **Dangote IPO:**
  - The offer is ₦2.15T (~$1.6B). Daba claims ₦1.5T was subscribed in the first hour. [V as a claim]
  - On-chain, day 1 (to 2:30pm, 15 Sep): ₦9.25M. [V] https://thecondia.com/dangote-refinery-ipo-onchain-subscriptions/
  - NectarFi had 72 buying wallets on day 1, and about 93% of its purchases came from wallets under 48 hours old.
  - Solana took 64% of on-chain buys; Base took the rest.
  - Sell-backs were 3.8% of gross value.
  - Your ₦20M+ / 206 wallets / 89.4% figures are [U]. ₦20M is about $15k, roughly 0.001% of the offer.
- **Nigerians holding US stocks:** I found no official figure. The app claims above imply low millions of accounts at most (my inference).
- **Foreign portfolio investors:** the 2022–24 FX backlog trapped foreign dividends and exit proceeds, and foreign share of NGX trading fell from about half to the teens [U]. The naira went from ₦600 (Jun 2023) to ₦1,600 (Jul 2024) to about ₦1,480 (Sep 2025). [V] https://en.wikipedia.org/wiki/Nigerian_naira
- **African IPO pipeline beyond Dangote:** [U].
- **Precedents elsewhere:**
  - The Philippine Treasury issued tokenised bonds as tests. [V] https://en.wikipedia.org/wiki/Bureau_of_the_Treasury
  - Thailand's G-Token, Hong Kong's tokenised green bonds, Brazil (Drex, Mercado Bitcoin), India's GIFT City and Vietnam's pilot were all sovereign or institutional pilots; none built retail secondary liquidity at scale [U].
  - The Astana exchange (AIX) website shows no tokenised products. [V] https://www.aixkz.com/
  - **The only thing that scaled is tokenised US stocks sold to retail outside the US.**

## 4) Whitespace and blockers

**Real whitespace**
- On-chain claims on NGX shares and FGN bonds/bills that are transferable and legally clean. Today buyers get receipts they can only sell back to the issuer.
- A licensed plug-in that lets crypto platforms (Busha, Quidax, Yellow Card, NectarFi) distribute IPOs, bills and money-market funds. The 55 approved Dangote channels included almost none.
- A published USD exit for foreign holders, backed by a CCI.
- Onshore products settled in cNGN, which is already on Solana.

**Not whitespace:** US stocks for Africans, and diaspora USD access to NGX IPOs. Both are already served.

**Blockers, hardest first**
1. FX and repatriation.
2. Licensing: ₦500M–₦2B capital, a resident CEO, SEC reach over offshore apps that target Nigerians, and SEC approval needed for USDC.
3. Custody and legal title: CSCS nominee arrangements. Receipts carry the issuer's credit risk.
4. Settlement mismatch: allotment comes about 1 business day after the close, and shares are credited in CSCS about 15 business days after. [V Daba]
5. KYC: BVN/NIN and the travel rule [U].
6. Liquidity and redemption: DPRI's only exit is selling back to GetEquity.

## 5) Verdict

- **Direction 1 (US stocks for Africans) is a commodity.** Issuance is already done: xStocks and Ondo are on Solana and open to Nigerians. Distribution belongs to Bamboo, Luno, Bybit and the ARIP exchanges, and competing legally needs a ₦200M–₦2B licence. It isn't defensible.
- **Direction 2 (African assets for the world) has real pain but tiny crypto demand.** Africa's biggest IPO put about 0.001% on-chain, and the buyers were mostly brand-new wallets. The asset brought people in, not the rail, and non-crypto fintechs already take diaspora USD. Solana isn't a moat either: DPRI ran on Base too.
- **The version that could be big and defensible** is a licensed rail for tokenised depositary receipts on Nigerian (then Kenyan and Ghanaian) listed stocks, FGN bonds and bills, and IPO allocations. It would be built as the two stacks above and sold B2B to issuing houses and crypto platforms.
  - The moat is licences plus CSCS/CCI/custodian plumbing, which global players won't build.
  - The ceiling is a ~$90–100B market plus occasional IPOs: probably a $1–10M-revenue business unless it becomes the pan-African rail for new offerings.
  - It needs a team, ₦500M+ in capital and 12–24 months, and it breaks your "don't build Solana infra solo" rule.
- **A solo wedge that fits your "payer must be crypto-native" rule:** a B2B API, running on a licensed partner, that lets crypto apps offer IPO allocations and USD-denominated FGN paper to Nigerians holding USDT. It's USD in and USD out, with no naira FX. A Domestic FGN US Dollar Bond exists [V] https://www.dmo.gov.ng, but its terms are [U].
  - Who's already there: Bamboo sells dollar fixed-return products and Trove offers USD accounts at up to 5.5% [V]. Crypto exchange "earn" products compete too [U]. Neither Bamboo nor Trove is stablecoin-native.
  - Kill test: if 200 users won't put in $500+ each within 60 days, stop.
- **The first 1,000 customers:**
  - The ~200 DPRI buyers and NectarFi's 1,000+ users.
  - Nigerians earning in USDC: remote developers, freelancers, Superteam Nigeria members.
  - Busha, Quidax and Yellow Card users, reached through partnerships.
  - A few hundred crypto-native diaspora.
  - Not LemFi's mainstream diaspora; they'll use Daba or MyStocks.
  - Your first *paying* customers are 3–5 platforms, not individuals.
- **Before writing code:** talk to GetEquity/NectarFi, Busha/Quidax and a Nigerian securities lawyer. Then watch whether the SEC finalises the Aug 2026 rules and approves USDC.
