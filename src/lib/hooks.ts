"use client";
import { useEffect, useState } from "react";

export type AssetOpt = { symbol: string; name: string; mint: string; kind: "xstock" | "prestock"; icon?: string; ref: string | null; company?: string };

export type BoardRow = {
  symbol: string; name: string; mint: string; kind: "xstock" | "prestock"; icon?: string;
  refPrice: number | null; refSource: string | null; fillPrice: number | null; premiumPct: number | null;
  impactPct: number | null; marketOpen: boolean | null; error?: string;
};
export type Board = { rows: BoardRow[]; at: number; probeUsd: number };

// Small shared cache so every screen reuses one fetch per endpoint.
const cache = new Map<string, { at: number; data: unknown; inflight?: Promise<unknown> }>();
async function load<T>(url: string, ttl: number): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  if (hit?.inflight) return hit.inflight as Promise<T>;
  const p = fetch(url).then((r) => r.json()).then((d) => { cache.set(url, { at: Date.now(), data: d }); return d; });
  cache.set(url, { at: hit?.at ?? 0, data: hit?.data, inflight: p });
  return p as Promise<T>;
}

export function useFetch<T>(url: string | null, ttl = 30_000, refreshMs?: number) {
  const [data, setData] = useState<T | null>(() => (url && cache.get(url)?.data as T) || null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const run = () => load<T>(url, ttl).then((d) => { if (alive) { setData(d); setError(null); } }).catch(() => alive && setError("Couldn't load this right now."));
    run();
    const t = refreshMs ? setInterval(run, refreshMs) : undefined;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [url, ttl, refreshMs]);
  return { data, error };
}

export const useAssets = () => useFetch<AssetOpt[]>("/api/assets", 300_000);
export const useBoard = () => useFetch<Board>("/api/board", 45_000, 60_000);
