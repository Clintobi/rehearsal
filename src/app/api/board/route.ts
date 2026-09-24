import { NextResponse } from "next/server";
import { allAssets, type Asset } from "@/lib/assets";
import { quote, USDC } from "@/lib/jup";
import { readPrices } from "@/lib/pyth";
import { marketStatus } from "@/lib/market";
import { rpc } from "@/lib/rehearse";
import { uiMultipliers } from "@/lib/scaled";

export const maxDuration = 60;
const PROBE_USD = 1000;

export type BoardRow = {
  symbol: string; name: string; mint: string; kind: Asset["kind"]; icon?: string;
  refPrice: number | null; refSource: string | null; fillPrice: number | null; premiumPct: number | null;
  impactPct: number | null; marketOpen: boolean | null; error?: string;
};

let cache: { at: number; body: unknown } | null = null;

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

export async function GET() {
  if (cache && Date.now() - cache.at < 45_000) return NextResponse.json(cache.body);
  const assets = await allAssets();
  const pythAssets = assets.filter((a) => a.ref.source === "pyth");
  const conn = rpc();
  const [prices, mults] = await Promise.all([
    readPrices(conn, pythAssets.map((a) => (a.ref as { account: string }).account)).catch(() => []),
    uiMultipliers(conn, assets.map((a) => a.mint)).catch(() => new Map<string, number>()),
  ]);
  const px = new Map(pythAssets.map((a, i) => [a.mint, prices[i]]));

  const rows = await pool(assets, 4, async (a): Promise<BoardRow> => {
    const p = px.get(a.mint);
    const refPrice = a.ref.source === "pyth" ? p?.price ?? null : a.ref.source === "prestocks" ? a.ref.markPrice : null;
    const refSource = a.ref.source === "pyth" ? "Pyth" : a.ref.source === "prestocks" ? "PreStocks mark" : null;
    const q = await quote(USDC, a.mint, BigInt(PROBE_USD * 1e6));
    const base = { symbol: a.symbol, name: a.name, mint: a.mint, kind: a.kind, icon: a.icon, refPrice, refSource,
      marketOpen: a.ref.source === "pyth" ? marketStatus(a.ref.schedule).open : null };
    if ("error" in q) return { ...base, fillPrice: null, premiumPct: null, impactPct: null, error: q.error };
    const fillPrice = PROBE_USD / ((Number(q.outAmount) / 10 ** a.decimals) * (mults.get(a.mint) ?? 1));
    return { ...base, fillPrice, premiumPct: refPrice ? (fillPrice / refPrice - 1) * 100 : null, impactPct: Number(q.priceImpactPct) * 100 };
  });
  const body = { probeUsd: PROBE_USD, at: Date.now(), rows };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
