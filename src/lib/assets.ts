import xstocks from "@/data/xstocks.json";
import { feedAccount } from "./pyth";

export type Issuer = "xStocks" | "PreStocks";
export type Kind = "xstock" | "prestock";

export type Asset = {
  kind: Kind;
  issuer: Issuer;
  symbol: string;
  name: string;
  company: string; // slug shared by every token on the same company
  mint: string;
  decimals: number;
  icon?: string;
  // Pyth equity feed for the listed share, when the company trades on a US exchange
  pyth?: { feed: string; account: string; schedule?: string; ticker: string };
  // Issuer's own mark, for pre-IPO structures
  mark?: { price: number; valuation: number };
};

export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

type XRow = (typeof xstocks)[number];

export function xstockAssets(): Asset[] {
  return (xstocks as XRow[]).map((x) => {
    const name = x.name.replace(" xStock", "");
    const live = x.equity && "account" in x.equity && x.equity.account && x.equity.shard === 1;
    return {
      kind: "xstock", issuer: "xStocks", symbol: x.symbol, name, company: slug(name),
      mint: x.mint, decimals: x.decimals, icon: x.icon,
      pyth: live ? { feed: x.equity!.id, account: feedAccount(x.equity!.id, 1).toBase58(), schedule: x.equity!.schedule, ticker: x.ticker } : undefined,
    };
  });
}

const cached = <T,>(ttl: number, fn: () => Promise<T>) => {
  let c: { at: number; v: T } | null = null;
  return async () => {
    if (c && Date.now() - c.at < ttl) return c.v;
    const v = await fn();
    c = { at: Date.now(), v };
    return v;
  };
};

type PreRow = { name: string; symbol: string; image: string; contract_address: string; markPrice: number; markValuation: number };
export const prestockAssets = cached(60_000, async (): Promise<Asset[]> => {
  const rows = (await (await fetch("https://prestocks.com/api/prestocks", { cache: "no-store" })).json()) as PreRow[];
  return rows.map((p) => {
    const name = p.name.replace(" PreStocks", "");
    return {
      kind: "prestock", issuer: "PreStocks", symbol: p.symbol, name, company: slug(name),
      mint: p.contract_address, decimals: 9, icon: p.image,
      mark: { price: p.markPrice, valuation: p.markValuation },
    };
  });
});

export async function allAssets(): Promise<Asset[]> {
  // PreStocks bounty rules exclude apps that integrate other issuers' pre-IPO tokens, so none are listed.
  const pre = await prestockAssets().catch(() => []);
  const all = [...xstockAssets(), ...pre];
  return all;
}

// xStocks carry the issuer's reference price and market cap on Jupiter; this fills in
// listed companies whose Pyth equity feed isn't pushed on-chain (SpaceX, Coinbase, ...).
export type StockData = { price: number; mcap: number };
export const xstockData = cached(60_000, async (): Promise<Map<string, StockData>> => {
  const mints = xstockAssets().map((a) => a.mint);
  const r = await (await fetch(`https://lite-api.jup.ag/price/v3?ids=${mints.join(",")}`, { cache: "no-store" })).json();
  const m = new Map<string, StockData>();
  for (const [mint, v] of Object.entries(r as Record<string, { stockData?: StockData }>)) if (v?.stockData?.price) m.set(mint, v.stockData);
  return m;
});
