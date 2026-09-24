import { NextResponse } from "next/server";
import { allAssets, type Asset } from "@/lib/assets";
import { quote, USDC } from "@/lib/jup";
import { readPrices } from "@/lib/pyth";
import { marketStatus } from "@/lib/market";
import { rpc } from "@/lib/rehearse";
import { mintInfos } from "@/lib/mintinfo";

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
  const pythAssets = assets.filter((a) => a.pyth);
  const conn = rpc();
  const [prices, mults] = await Promise.all([
    readPrices(conn, pythAssets.map((a) => a.pyth!.account)).catch(() => []),
    mintInfos(conn, assets.map((a) => a.mint)).catch(() => new Map()),
  ]);
  const px = new Map(pythAssets.map((a, i) => [a.mint, prices[i]]));

  const rows = await pool(assets, 4, async (a): Promise<BoardRow> => {
    const p = px.get(a.mint);
    const refPrice = a.pyth ? p?.price ?? null : a.mark ? a.mark.price : null;
    const refSource = a.pyth ? "Pyth" : a.mark ? "PreStocks mark" : null;
    const q = await quote(USDC, a.mint, BigInt(PROBE_USD * 1e6));
    const base = { symbol: a.symbol, name: a.name, mint: a.mint, kind: a.kind, icon: a.icon, refPrice, refSource,
      marketOpen: a.pyth ? marketStatus(a.pyth.schedule).open : null };
    if ("error" in q) return { ...base, fillPrice: null, premiumPct: null, impactPct: null, error: q.error };
    const info = mults.get(a.mint);
    const fillPrice = PROBE_USD / ((Number(q.outAmount) / 10 ** a.decimals) * (info?.multiplier ?? 1) * (1 - (info?.transferFeeBps ?? 0) / 10_000));
    return { ...base, fillPrice, premiumPct: refPrice ? (fillPrice / refPrice - 1) * 100 : null, impactPct: Number(q.priceImpactPct) * 100 };
  });
  const body = { probeUsd: PROBE_USD, at: Date.now(), rows };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
