// Weekend study: how well tokenized-stock prices on Solana predicted each Monday open.
// For every weekend: the token's move from Friday 16:00 New York to Monday 09:00 (the main
// Solana pool's hourly bars, GeckoTerminal) against the real stock's Friday close to Monday
// open (Yahoo daily bars). Writes data/weekend.json, which /api/weekend uses for its ranges.
//   npx tsx scripts/weekend-study.ts
import { writeFileSync } from "fs";
import xstocks from "../src/data/xstocks.json";

const SYMBOLS = ["SPYx", "QQQx", "NVDAx", "TSLAx", "GOOGLx", "AAPLx", "MSTRx", "HOODx", "CRCLx"];
const MIN_POOL_USD = 100_000;
const UA = { "User-Agent": "Mozilla/5.0" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) return r.json();
    if (r.status === 401 || r.status === 404) throw new Error(`${r.status} ${url}`);
    if (i >= 8) throw new Error(`${r.status} ${url}`);
    await sleep((r.status === 429 ? 15000 : 3000) * (i + 1)); // GeckoTerminal's free tier rate-limits hard
  }
}

const ny = (unix: number) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" })
    .formatToParts(new Date(unix * 1000)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday };
};

type Row = { fri: string; mon: string; tokFri: number; tokMon: number; closeFri: number; openMon: number; rTok: number; rAct: number; err: number };

async function topPool(mint: string) {
  const j = await get(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=1`);
  const pools = (j.data ?? []).map((p: { attributes: { address: string; name: string; reserve_in_usd: string } }) => p.attributes)
    .filter((a: { name: string }) => /USDC/.test(a.name))
    .sort((a: { reserve_in_usd: string }, b: { reserve_in_usd: string }) => Number(b.reserve_in_usd) - Number(a.reserve_in_usd));
  return pools[0] as { address: string; name: string; reserve_in_usd: string } | undefined;
}

async function hourly(pool: string, mint: string) {
  const bars = new Map<number, number>(); // bar start (unix) -> close
  let before = Math.floor(Date.now() / 1000);
  for (let page = 0; page < 12; page++) {
    // The free tier serves about six months of history; older pages return 401.
    const j = await get(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/hour?limit=1000&before_timestamp=${before}&token=${mint}`).catch(() => null);
    if (!j) break;
    const list: number[][] = j.data?.attributes?.ohlcv_list ?? [];
    if (!list.length) break;
    for (const [t, , , , c] of list) bars.set(t, c);
    before = Math.min(...list.map((x) => x[0]));
    await sleep(4000);
  }
  return bars;
}

async function daily(ticker: string) {
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=2y&interval=1d`);
  const r = j.chart.result[0];
  const q = r.indicators.quote[0];
  return (r.timestamp as number[]).map((t, i) => ({ date: ny(t).date, weekday: ny(t).weekday, open: q.open[i] as number, close: q.close[i] as number })).filter((d) => d.open && d.close);
}

(async () => {
  const out: Record<string, unknown> = {};
  for (const sym of SYMBOLS) {
    const x = (xstocks as unknown as { symbol: string; ticker: string; mint: string }[]).find((r) => r.symbol === sym);
    if (!x) continue;
    const days = await daily(x.ticker);
    // Monday gaps: first open after a break of 3+ days (weekends, long weekends).
    const gaps = [] as { date: string; gap: number }[];
    for (let i = 1; i < days.length; i++) {
      const dt = (Date.parse(days[i].date) - Date.parse(days[i - 1].date)) / 86400000;
      if (dt >= 3) gaps.push({ date: days[i].date, gap: days[i].open / days[i - 1].close - 1 });
    }

    const pool = await topPool(x.mint);
    const rows: Row[] = [];
    if (pool && Number(pool.reserve_in_usd) >= MIN_POOL_USD) {
      const bars = await hourly(pool.address, x.mint);
      const at = (date: string, hourStart: number) => {
        for (const [t, c] of bars) { const n = ny(t); if (n.date === date && n.hour === hourStart) return c; }
        return null;
      };
      for (let i = 1; i < days.length; i++) {
        const dt = (Date.parse(days[i].date) - Date.parse(days[i - 1].date)) / 86400000;
        if (dt < 3) continue;
        const tokFri = at(days[i - 1].date, 15); // bar 15:00-16:00, closes at the bell
        const tokMon = at(days[i].date, 8); // bar 08:00-09:00
        if (!tokFri || !tokMon) continue;
        const rTok = tokMon / tokFri - 1, rAct = days[i].open / days[i - 1].close - 1;
        rows.push({ fri: days[i - 1].date, mon: days[i].date, tokFri, tokMon, closeFri: days[i - 1].close, openMon: days[i].open, rTok, rAct, err: rTok - rAct });
      }
    }
    const abs = rows.map((r) => Math.abs(r.err) * 1e4).sort((a, b) => a - b);
    const q = (p: number) => (abs.length ? abs[Math.min(abs.length - 1, Math.floor(p * abs.length))] : null);
    const moved = rows.filter((r) => Math.abs(r.rAct) > 0.001);
    out[sym] = {
      ticker: x.ticker, pool: pool?.address ?? null, poolName: pool?.name ?? null,
      gaps,
      rows,
      stats: {
        weekends: rows.length,
        rightDirection: moved.filter((r) => Math.sign(r.rTok) === Math.sign(r.rAct)).length,
        movedWeekends: moved.length,
        medianMissBps: q(0.5), p80MissBps: q(0.8), maxMissBps: abs.length ? abs[abs.length - 1] : null,
      },
    };
    console.log(sym, `pool ${pool?.name ?? "none"}`, `weekends ${rows.length}`, `gaps ${gaps.length}`, `median miss ${q(0.5)?.toFixed(0)} bps`);
  }
  writeFileSync("data/weekend.json", JSON.stringify({ generatedAt: new Date().toISOString(), source: { tokens: "GeckoTerminal hourly bars, main Solana USDC pool", stocks: "Yahoo daily bars" }, stocks: out }));
  console.log("wrote data/weekend.json");
})();
