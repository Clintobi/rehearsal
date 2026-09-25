// Outside signals a trader (or an agent) should see before trading a tokenized stock:
// - xStocks' own public API: trading session, issuer halts, proof of reserves, corporate actions
// - Lighter's 24/7 equity perps: the market's live estimate of the stock while US markets are shut
const XS = "https://api.xstocks.fi/api/v2/public";
const LIGHTER = "https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails";

const memo = new Map<string, { at: number; v: unknown }>();
async function cachedJson<T>(url: string, ttlMs: number, timeoutMs = 6000): Promise<T | null> {
  const hit = memo.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw new Error(String(r.status));
    const v = (await r.json()) as T;
    memo.set(url, { at: Date.now(), v });
    return v;
  } catch {
    return (hit?.v as T) ?? null; // stale beats nothing; callers label freshness
  }
}

export type Session = {
  period: "market" | "extended" | "overnight" | "closed" | string;
  openNow: boolean;
  nextChangeAt: string | null;
  exchange: string | null;
  issuerHalted: boolean;
  atomicHalted: boolean;
  source: "xStocks";
};

type XsAsset = {
  isTradingHalted: boolean;
  trading?: { currentPeriod: string; openNow: boolean; nextChangeAt: string; isTradingHalted: boolean; exchange?: { abbreviation: string } };
};

export async function xstockSession(symbol: string): Promise<Session | null> {
  const [a, s] = await Promise.all([
    cachedJson<XsAsset>(`${XS}/assets/${encodeURIComponent(symbol)}`, 60_000),
    cachedJson<{ isMarketTradingHalted: boolean; isAtomicTradingHalted: boolean }>(`${XS}/system/status/${encodeURIComponent(symbol)}`, 30_000),
  ]);
  if (!a?.trading) return null;
  return {
    period: a.trading.currentPeriod,
    openNow: a.trading.openNow,
    nextChangeAt: a.trading.nextChangeAt ?? null,
    exchange: a.trading.exchange?.abbreviation ?? null,
    issuerHalted: !!(a.isTradingHalted || a.trading.isTradingHalted || s?.isMarketTradingHalted),
    atomicHalted: !!s?.isAtomicTradingHalted,
    source: "xStocks",
  };
}

export type Reserves = { sharesHeld: number; circulating: number; coverage: number; custodians: string[]; at: string; source: string };

export async function xstockReserves(symbol: string): Promise<Reserves | null> {
  const r = await cachedJson<{ timestamp: string; sharesHeld: string; circulatingSupply: string; holdings: { provider: string }[] }>(
    `${XS}/proof-of-reserves/${encodeURIComponent(symbol)}`, 600_000);
  if (!r) return null;
  const held = Number(r.sharesHeld), circ = Number(r.circulatingSupply);
  if (!(circ > 0)) return null;
  return {
    sharesHeld: held, circulating: circ, coverage: held / circ,
    custodians: [...new Set(r.holdings.map((h) => h.provider))], at: r.timestamp,
    source: `${XS}/proof-of-reserves/${symbol}`,
  };
}

export type CorporateAction = { type: string; effective: string; cashUsd: number | null; multiplierOld: number | null; multiplierNew: number | null; status: string };

export async function xstockActions(symbol: string): Promise<CorporateAction[]> {
  const r = await cachedJson<{ nodes: { caType: string; effectiveTimeUtc: string; netCashflowUsd: string | null; multiplierOld: string | null; multiplierNew: string | null; status: string; xstockSymbol: string }[] }>(
    `${XS}/corporate-actions/upcoming?symbol=${encodeURIComponent(symbol)}&pageSize=10`, 900_000);
  return (r?.nodes ?? [])
    // The "upcoming" endpoint also returns past-dated scheduled items; keep only future ones.
    .filter((n) => n.xstockSymbol === symbol && Date.parse(n.effectiveTimeUtc) > Date.now())
    .map((n) => ({
      type: n.caType, effective: n.effectiveTimeUtc, status: n.status,
      cashUsd: n.netCashflowUsd != null ? Number(n.netCashflowUsd) : null,
      multiplierOld: n.multiplierOld != null ? Number(n.multiplierOld) : null,
      multiplierNew: n.multiplierNew != null ? Number(n.multiplierNew) : null,
    }))
    .sort((a, b) => a.effective.localeCompare(b.effective));
}

export type Perp = { venue: "Lighter"; symbol: string; mark: number; index: number; last: number; volume24hUsd: number; openInterest: number };

type LighterBook = { symbol: string; market_type: string; status: string; mark_price: string; index_price: string; last_trade_price: number; daily_quote_token_volume: number; open_interest: number };

export async function perpReference(ticker: string): Promise<Perp | null> {
  const r = await cachedJson<{ order_book_details: LighterBook[] }>(LIGHTER, 30_000);
  const b = r?.order_book_details?.find((x) => x.symbol === ticker && x.market_type === "perp" && x.status === "active");
  if (!b) return null;
  const mark = Number(b.mark_price);
  if (!(mark > 0)) return null;
  return { venue: "Lighter", symbol: b.symbol, mark, index: Number(b.index_price), last: b.last_trade_price, volume24hUsd: b.daily_quote_token_volume, openInterest: b.open_interest };
}
