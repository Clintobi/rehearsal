// The weekend layer. While US markets are closed: where each stock should reopen, implied by
// its token's move on Solana since the close, with a range from how well that has worked
// before (data/weekend.json). And for lenders: how big a reopening drop liquidates a
// maxed-out Kamino loan, and how often Mondays have opened that far down.
import { Connection, PublicKey } from "@solana/web3.js";
import xstocks from "@/data/xstocks.json";
import study from "../../data/weekend.json";
import { readPrices } from "./pyth";

const KAMINO_MAIN = "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua";
// Kamino klend Reserve: config.loan_to_value_pct at 4872, liquidation_threshold_pct at 4873.
// Checked against Kamino's API: the byte at 4872 must equal the API's max LTV.
const LTV_OFFSET = 4872;
const UA = { "User-Agent": "Mozilla/5.0" };

type StudyStock = {
  ticker: string; pool: string | null; poolName: string | null;
  gaps: { date: string; gap: number }[];
  rows: { fri: string; mon: string; rTok: number; rAct: number; err: number }[];
  stats: { weekends: number; rightDirection: number; movedWeekends: number; medianMissBps: number | null; p80MissBps: number | null; maxMissBps: number | null };
};
const STUDY = study as unknown as { generatedAt: string; stocks: Record<string, StudyStock> };
type XRow = { symbol: string; ticker: string; name: string; mint: string; icon: string; equity: { id: string; account?: string } };
const X = xstocks as unknown as XRow[];

const nyParts = (d = new Date()) => Object.fromEntries(new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).formatToParts(d).map((x) => [x.type, x.value]));

/** Regular session open right now (holidays not handled). */
export function marketOpen(d = new Date()) {
  const p = nyParts(d);
  const hm = Number(p.hour) * 100 + Number(p.minute);
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(p.weekday) && hm >= 930 && hm < 1600;
}

/** New York date (YYYY-MM-DD) of the most recent regular-session close. */
function lastCloseDate(d = new Date()) {
  for (let back = 0; back < 7; back++) {
    const t = new Date(d.getTime() - back * 86400_000);
    const p = nyParts(t);
    if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(p.weekday)) continue;
    if (back === 0 && Number(p.hour) < 16) continue;
    return `${p.year}-${p.month}-${p.day}`;
  }
  return null;
}

// Token price at the 16:00 bell: the close of the 15:00-16:00 hourly bar of its main pool.
const bellCache = new Map<string, { at: number; v: number | null }>();
async function tokenAtBell(pool: string, mint: string, date: string) {
  const key = `${pool}:${date}`;
  const hit = bellCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.v;
  let v: number | null = null;
  try {
    const j = await (await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/hour?limit=200&token=${mint}`, { headers: UA })).json();
    for (const [t, , , , c] of (j.data?.attributes?.ohlcv_list ?? []) as number[][]) {
      const p = nyParts(new Date(t * 1000));
      if (`${p.year}-${p.month}-${p.day}` === date && Number(p.hour) === 15) v = c;
    }
  } catch { /* leave null */ }
  bellCache.set(key, { at: Date.now(), v });
  return v;
}

export type Forecast = {
  symbol: string; ticker: string; name: string; icon: string;
  close: number | null; closeDate: string | null; tokenNow: number | null; tokenAtClose: number | null;
  implied: number | null; changePct: number | null; rangePct: number | null;
  record: StudyStock["stats"]; last: { mon: string; forecastPct: number; actualPct: number } | null;
};

export async function forecasts(conn: Connection): Promise<{ open: boolean; forecasts: Forecast[]; studyAt: string }> {
  const open = marketOpen();
  const syms = Object.keys(STUDY.stocks).filter((s) => STUDY.stocks[s].pool && STUDY.stocks[s].stats.weekends > 0);
  // Only stocks with a free on-chain Pyth price: the forecast is anchored to that close.
  const rows = syms.map((s) => X.find((x) => x.symbol === s)!).filter((r) => r?.equity.account);
  const prices = await readPrices(conn, rows.map((r) => r.equity.account!));
  const jup = await fetch(`https://lite-api.jup.ag/price/v3?ids=${rows.map((r) => r.mint).join(",")}`).then((r) => r.json()).catch(() => ({}));
  const date = lastCloseDate();
  const out: Forecast[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const st = STUDY.stocks[r.symbol];
    const close = prices[i]?.price ?? null;
    const tokenNow = (jup?.[r.mint]?.usdPrice as number | undefined) ?? null;
    const tokenAtClose = !open && date && st.pool ? await tokenAtBell(st.pool, r.mint, date) : null;
    const implied = close && tokenNow && tokenAtClose ? close * (tokenNow / tokenAtClose) : null;
    const lastRow = st.rows[st.rows.length - 1];
    out.push({
      symbol: r.symbol, ticker: r.ticker, name: r.name, icon: r.icon,
      close, closeDate: date, tokenNow, tokenAtClose,
      implied, changePct: implied && close ? (implied / close - 1) * 100 : null,
      rangePct: st.stats.p80MissBps !== null ? st.stats.p80MissBps / 100 : null,
      record: st.stats,
      last: lastRow ? { mon: lastRow.mon, forecastPct: lastRow.rTok * 100, actualPct: lastRow.rAct * 100 } : null,
    });
  }
  return { open, forecasts: out, studyAt: STUDY.generatedAt };
}

export type LenderRisk = {
  symbol: string; ticker: string; icon: string; suppliedUsd: number;
  maxLtvPct: number; liquidationPct: number; dropToLiquidatePct: number;
  mondays: number; mondaysThatFar: number; worstMondayPct: number; worstMondayDate: string; safeLtvPct: number;
};

export async function lenderRisk(conn: Connection): Promise<LenderRisk[]> {
  const met = (await (await fetch(`https://api.kamino.finance/kamino-market/${KAMINO_MAIN}/reserves/metrics?env=mainnet-beta`, { headers: UA })).json()) as
    { reserve: string; liquidityToken: string; maxLtv: string; totalSupplyUsd: string }[];
  const stocks = met.filter((m) => STUDY.stocks[m.liquidityToken] && Number(m.totalSupplyUsd) > 1000);
  const accts = await conn.getMultipleAccountsInfo(stocks.map((s) => new PublicKey(s.reserve)));
  const out: LenderRisk[] = [];
  stocks.forEach((s, i) => {
    const d = accts[i]?.data;
    const st = STUDY.stocks[s.liquidityToken];
    if (!d || d.length <= LTV_OFFSET + 1 || !st.gaps.length) return;
    const ltv = d[LTV_OFFSET], thr = d[LTV_OFFSET + 1];
    if (ltv !== Math.round(Number(s.maxLtv) * 100) || thr <= ltv) return; // layout changed: skip rather than guess
    const drop = 1 - ltv / thr;
    const worst = st.gaps.reduce((w, g) => (g.gap < w.gap ? g : w), st.gaps[0]);
    out.push({
      symbol: s.liquidityToken, ticker: st.ticker, icon: X.find((x) => x.symbol === s.liquidityToken)?.icon ?? "",
      suppliedUsd: Number(s.totalSupplyUsd), maxLtvPct: ltv, liquidationPct: thr, dropToLiquidatePct: drop * 100,
      mondays: st.gaps.length, mondaysThatFar: st.gaps.filter((g) => g.gap <= -drop).length,
      worstMondayPct: worst.gap * 100, worstMondayDate: worst.date,
      // Highest starting loan that would have survived every reopening in the sample.
      safeLtvPct: Math.min(ltv, Math.max(0, thr * (1 + Math.min(0, worst.gap)))),
    });
  });
  return out.sort((a, b) => b.suppliedUsd - a.suppliedUsd);
}
