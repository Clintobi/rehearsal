import xstocks from "@/data/xstocks.json";
import { feedAccount } from "./pyth";

export type Asset = {
  kind: "xstock" | "prestock";
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  icon?: string;
  // Where the fair-value reference comes from
  ref:
    | { source: "pyth"; feed: string; account: string; schedule?: string; ticker: string }
    | { source: "prestocks"; markPrice: number; markValuation: number; tokenPrice: number }
    | { source: "none" };
};

type XRow = (typeof xstocks)[number];

export function xstockAssets(): Asset[] {
  return (xstocks as XRow[]).map((x) => ({
    kind: "xstock",
    symbol: x.symbol,
    name: x.name.replace(" xStock", ""),
    mint: x.mint,
    decimals: x.decimals,
    icon: x.icon,
    ref: x.equity && "account" in x.equity && x.equity.account && x.equity.shard === 1
      ? { source: "pyth", feed: x.equity.id, account: feedAccount(x.equity.id, 1).toBase58(), schedule: x.equity.schedule, ticker: x.ticker }
      : { source: "none" },
  }));
}

type PreRow = { name: string; symbol: string; image: string; contract_address: string; markPrice: number; markValuation: number; tokenPrice: number };
let preCache: { at: number; rows: Asset[] } | null = null;

export async function prestockAssets(): Promise<Asset[]> {
  if (preCache && Date.now() - preCache.at < 60_000) return preCache.rows;
  const r = await fetch("https://prestocks.com/api/prestocks", { cache: "no-store" });
  const rows = (await r.json()) as PreRow[];
  const out: Asset[] = rows.map((p) => ({
    kind: "prestock",
    symbol: p.symbol,
    name: p.name.replace(" PreStocks", ""),
    mint: p.contract_address,
    decimals: 9,
    icon: p.image,
    ref: { source: "prestocks", markPrice: p.markPrice, markValuation: p.markValuation, tokenPrice: p.tokenPrice },
  }));
  preCache = { at: Date.now(), rows: out };
  return out;
}

export async function allAssets(): Promise<Asset[]> {
  const pre = await prestockAssets().catch(() => []);
  return [...xstockAssets(), ...pre];
}
