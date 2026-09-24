# Research brief: execution quality for tokenized stocks on Solana

Compiled 24 Sep 2026 from four research passes: peer-reviewed and academic work, industry and regulator publications, pre-IPO and PreStocks sources, and Solana prior art. [V] means the source was opened. [S] means it was seen only in a search snippet or abstract.

## The problem is documented, in regulators' own words

- **SEC Investor Advisory Committee, recommendation approved 12 Mar 2026 [V].** Without a broker-dealer, "the duty of best execution would potentially no longer apply, and retail investors may purchase or sell stock … at a worse price than is otherwise publicly available." https://www.sec.gov/files/recommendation-tokenization-equity-securities.pdf
- **Allium, 15 Sep 2026 [V].** There is "no yardstick to prove a tokenized trade got a fair fill" and no consolidated feed or NBBO. https://www.allium.so/blog/nbbo-the-best-us-stock-price-and-why-crypto-lacks-one/
- **Pyth, 9 Jun 2026 [V].** Off-hours marks are self-referential or "custom logic … Neither is an independent reference." https://www.pyth.network/blog/24-7-finance-needs-24-7-price-infrastructure-introducing-pyth-indices
- **World Federation of Exchanges, 26 Aug 2025 [V via Ledger Insights], and IOSCO, Nov 2025 [S].** Tokenized stocks are "mimics." Fragmentation and investor misunderstanding.

## How big the gap is

- **Aspris, Dyhrberg, Foley, Krekel, Putniņš, J. Int. Fin. Markets, Inst. & Money 109 (2026) [peer-reviewed, full text read].** FTX tokenized equities had spread plus impact of about 51 bps, roughly 10× the underlying. AMM price impact was 192.76 bps, with "sizable and persistent" price dislocations. https://www.sciencedirect.com/science/article/pii/S1042443126000181
- **Cong, Landsman, Rabetti, Zhang, Zhao, "Tokenized Stocks" (SSRN, Dec 2025) [working paper, S].** Tokens track the underlying in regular hours and deviate modestly off-hours. Weekend moves anticipate Monday's open, and short-horizon off-hours returns reverse. So an off-hours reference needs its own model. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5937314
- **Mazur & Polyzos, Finance Research Letters 106 (2026) [peer-reviewed, S].** Tracking error rises with volatility and uncertainty, which argues for tolerance that scales with conditions.
- **Talos, 24 Jun 2026 [V].** NVDAx weekend volume is 41% of weekday volume, and Ondo's NVDAon is 17%.
- **Solana holds about 95–97% of on-chain equity volume.** Q2 2026 volume was $4.8B, up from $1.1B in Q1 (rwa.xyz via Solana Compass [V]). Tokenized equities total $2.8B in market cap (The Block, 17 Aug 2026 [V]).
- **Gerzon et al., ACM IMC 2025 [peer-reviewed, full text read].** More than 500K sandwiches on Solana over 4 months cost victims more than $7.7M, and users spent more than $2.4M on defensive tips.

## Pre-IPO specifics

- **Gornall & Strebulaev, JFE 135(1) 2020 [peer-reviewed].** Unicorn post-money valuations average 48% above fair value, so the last-round mark is an optimistic ceiling.
- **Caplight 2025 [S].** Secondaries average a 15.6% discount to the last round.
- **Field & Hanka, J. Finance 56(2) 2001 [peer-reviewed].** Lock-up expiry brings a −1.5% three-day abnormal return and +40% volume.
- **PreStocks FAQ [V].** On IPO, a token becomes convertible after a typical 6-month lockup and may trade at a discount meanwhile. Holders have 9 months to convert or the token "expires worthless." Marks use Sacra and Contrary Research data. Holders are told to "compare the total supply in circulation to the figures in the [attestation] report."
- **SPACEX [V].** It must convert to SPCXx before 23:59 UTC on 12 Mar 2027.
- **CoinDesk, 13 May 2026 [V].** ANTHROPIC and OPENAI PreStocks fell 34% and 39% after the companies called SPV transfers void. ANTHROPIC exit liquidity was about $351k at the time.

## Prior art for the guard (Solana)

| Project | What it guarantees | Oracle-aware | Any swap |
|---|---|---|---|
| Lighthouse (Phantom, Solflare) | Account and balance-delta assertions | Raw bytes only, no cross-account arithmetic | Yes |
| Jupiter min-out / Ultra | Slippage measured against the quote | No | Jupiter only |
| Jito DontFront | Ordering (no front-running) | No | Yes |
| scrip (Stocklana, mainnet) | Received ≥ Pyth value − tolerance | Yes | Its own sweeps only |
| holdfill (Stocklana) | Revert below a user minimum | No | Its own orders only |
| Closing Bell (Stocklana) | Pyth band, widened when the market is closed | Yes | Its own flow, devnet only |
| **Rehearsal Guard** | **Fill vs Pyth or limit at the moment it executes, multiplier-aware, with ledger** | **Yes** | **Yes** |

What is new: a guard any wallet can attach to any swap, which checks the ratio of the two balance changes against a verified oracle price when the transaction lands. Lighthouse can't express that, and the others each guard only their own flow.

## Gaps nobody has filled (as of 24 Sep 2026)

1. No retail best-execution benchmark or fill receipt for tokenized stocks.
2. No map of exit capacity: how much of each token can be sold within 1%, 2% or 5% of price impact, set against the largest holders.
3. No pricing of the IPO-conversion discount: what the SPACEX discount to SPCXx implies per year until the conversion deadline.
4. No public dataset of on-chain tokenized-equity fills against Pyth.
5. No peer-reviewed study of whether Pyth's confidence intervals are well calibrated off-hours.
