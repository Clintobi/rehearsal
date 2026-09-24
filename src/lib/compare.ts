import type { Asset } from "./assets";
import { allAssets, xstockData } from "./assets";
import { quote, USDC, type Quote } from "./jup";
import { mintInfos } from "./mintinfo";
import { readPrices } from "./pyth";
import { marketStatus, type MarketStatus } from "./market";
import { rpc } from "./rehearse";

export type Route = {
  symbol: string; issuer: Asset["issuer"]; kind: Asset["kind"]; mint: string; icon?: string;
  fill: number | null; // $ per token as a wallet shows it
  tokens: number | null;
  exitFeeBps: number; multiplier: number;
  roundTripPct: number | null;
  impact: number | null;
  impliedValuation: number | null; // company valuation this fill implies
  unitsBasis: string; // how impliedValuation was derived
  structure: string; // what you actually hold
  error?: string;
  quote?: Quote;
};

export type Company = {
  company: string; name: string; usd: number; at: number;
  listed: { price: number; mcap: number; source: string; account?: string; ageSec?: number; market?: MarketStatus } | null;
  marks: { issuer: string; price: number; valuation: number }[];
  routes: Route[];
  best: string | null; // mint of the cheapest route by implied valuation
  notes: string[];
};

const STRUCTURE: Record<Asset["kind"], string> = {
  xstock: "Tracker certificate backed 1:1 by the listed share (Backed Finance)",
  prestock: "SPV exposure to the company, tracks its price; converts or redeems after a liquidity event",
};

export async function companies() {
  const assets = await allAssets();
  const by = new Map<string, Asset[]>();
  for (const a of assets) by.set(a.company, [...(by.get(a.company) ?? []), a]);
  return by;
}

export async function compare(slug: string, usd: number): Promise<Company | { error: string }> {
  const group = (await companies()).get(slug);
  if (!group?.length) return { error: "Unknown company" };
  const conn = rpc();
  const pythAsset = group.find((a) => a.pyth);
  const [infos, prices, sd] = await Promise.all([
    mintInfos(conn, group.map((a) => a.mint)),
    pythAsset ? readPrices(conn, [pythAsset.pyth!.account]).catch(() => [null]) : Promise.resolve([null]),
    xstockData().catch(() => new Map()),
  ]);
  const xs = group.find((a) => a.kind === "xstock");
  const stock = xs ? sd.get(xs.mint) : undefined;
  const shares = stock ? stock.mcap / stock.price : null;

  let listed: Company["listed"] = null;
  const p = prices[0];
  if (p && shares) {
    listed = { price: p.price, mcap: p.price * shares, source: `Pyth Equity.US.${pythAsset!.pyth!.ticker}/USD (on-chain)`, account: p.account,
      ageSec: Math.round(Date.now() / 1000 - p.publishTime), market: marketStatus(pythAsset!.pyth!.schedule) };
  } else if (stock && shares) {
    listed = { price: stock.price, mcap: stock.mcap, source: "xStocks issuer reference price" };
  }

  const routes: Route[] = [];
  for (const a of group) {
    const info = infos.get(a.mint) ?? { multiplier: 1, transferFeeBps: 0 };
    const base = { symbol: a.symbol, issuer: a.issuer, kind: a.kind, mint: a.mint, icon: a.icon, exitFeeBps: info.transferFeeBps, multiplier: info.multiplier, structure: STRUCTURE[a.kind] };
    const q = await quote(USDC, a.mint, BigInt(Math.round(usd * 1e6)));
    if ("error" in q) { routes.push({ ...base, fill: null, tokens: null, roundTripPct: null, impact: null, impliedValuation: null, unitsBasis: "", error: q.error }); continue; }
    const tokens = (Number(q.outAmount) / 10 ** a.decimals) * info.multiplier * (1 - info.transferFeeBps / 10_000);
    const fill = usd / tokens;
    // Selling back: a Token-2022 transfer fee is withheld from what reaches the pool.
    const sellRaw = BigInt(Math.floor(Number(q.outAmount) * (1 - info.transferFeeBps / 10_000) ** 2));
    const back = await quote(a.mint, USDC, sellRaw);
    const roundTripPct = "error" in back ? null : (1 - Number(back.outAmount) / 1e6 / usd) * 100;
    let impliedValuation: number | null = null;
    let unitsBasis = "";
    if (a.kind === "xstock" && shares) { impliedValuation = fill * shares; unitsBasis = `${(shares / 1e9).toFixed(2)}B shares outstanding`; }
    else if (a.mark) { const units = a.mark.valuation / a.mark.price; impliedValuation = fill * units; unitsBasis = `${a.issuer} mark: $${fmtV(a.mark.valuation)} ÷ $${a.mark.price.toFixed(2)} = ${units >= 1e9 ? `${(units / 1e9).toFixed(2)}B` : `${(units / 1e6).toFixed(1)}M`} token-equivalents`; }
    routes.push({ ...base, fill, tokens, roundTripPct, impact: Number(q.priceImpactPct) * 100, impliedValuation, unitsBasis, quote: q });
  }

  const priced = routes.filter((r) => r.impliedValuation);
  const best = priced.length ? priced.reduce((a, b) => (b.impliedValuation! < a.impliedValuation! ? b : a)).mint : null;
  const marks = group.filter((a) => a.mark).map((a) => ({ issuer: a.issuer, price: a.mark!.price, valuation: a.mark!.valuation }));

  const notes: string[] = [];
  if (listed && group.some((a) => a.kind !== "xstock")) notes.push(`${group[0].name} is listed. Pre-IPO tokens still pay out through their issuer's conversion or redemption process, so a discount to the listed price is the price of waiting and of issuer risk.`);
  const units = group.filter((a) => a.mark).map((a) => a.mark!.valuation / a.mark!.price);
  if (units.length > 1 && Math.max(...units) / Math.min(...units) > 1.25) notes.push("Issuers disagree by more than 25% on how much of the company one token represents, which usually means a split one mark hasn't caught up with. Compare implied valuations, not token prices.");
  return { company: slug, name: group[0].name, usd, at: Date.now(), listed, marks, routes, best, notes };
}

export const fmtV = (v: number) => (v >= 1e12 ? `${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : `${(v / 1e6).toFixed(0)}M`);
