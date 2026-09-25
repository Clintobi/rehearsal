// Pre-IPO board: every PreStocks token, what its market price values the company at, and what
// the company must be worth at a listing for a buyer today to break even after the 1% fees.
// PreStocks data only: the PreStocks bounty excludes apps that integrate other pre-IPO issuers.
type Raw = { name: string; symbol: string; image: string; contract_address: string; markPrice: number; markValuation: number; tokenPrice: number; impliedValuation: number; supply: number };

export type PreRow = {
  symbol: string; name: string; mint: string; icon: string; url: string;
  markPrice: number; markValuation: number;
  tokenPrice: number; impliedValuation: number; premiumPct: number;
  supply: number; floatUsd: number;
  breakEvenValuation: number; // listing value needed to get your money back after 1% in + 1% out
};

const FEE = 0.01;
let cache: { at: number; rows: PreRow[] } | null = null;

export async function preBoard(): Promise<PreRow[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows;
  const raw = (await (await fetch("https://prestocks.com/api/prestocks", { cache: "no-store", signal: AbortSignal.timeout(8000) })).json()) as Raw[];
  const rows = raw.map((p) => ({
    symbol: p.symbol, name: p.name.replace(" PreStocks", ""), mint: p.contract_address, icon: p.image, url: `https://www.prestocks.com/${p.name.replace(" PreStocks", "").toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    markPrice: p.markPrice, markValuation: p.markValuation,
    tokenPrice: p.tokenPrice, impliedValuation: p.impliedValuation,
    premiumPct: (p.tokenPrice / p.markPrice - 1) * 100,
    supply: p.supply, floatUsd: p.supply * p.tokenPrice,
    breakEvenValuation: p.impliedValuation / ((1 - FEE) * (1 - FEE)),
  })).sort((a, b) => b.floatUsd - a.floatUsd);
  cache = { at: Date.now(), rows };
  return rows;
}
