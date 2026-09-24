import { Connection } from "@solana/web3.js";
import type { Asset } from "./assets";
import { quote, USDC, type Quote } from "./jup";
import { readPrices } from "./pyth";
import { marketStatus, type MarketStatus } from "./market";
import { uiMultipliers } from "./scaled";

export type Reference = {
  price: number;
  source: string; // human label
  detail: string;
  account?: string;
  conf?: number;
  ageSec?: number;
  market?: MarketStatus;
};

export type Verdict = { level: "good" | "warn" | "bad" | "unknown"; headline: string; reasons: string[] };

export type Rehearsal = {
  asset: Pick<Asset, "symbol" | "name" | "mint" | "kind" | "icon">;
  side: "buy" | "sell";
  usd: number;
  tokens: number; // shares as a wallet displays them
  uiMultiplier: number;
  fillPrice: number;
  spotPrice: number | null;
  sizeImpactPct: number | null;
  roundTripCostPct: number | null;
  route: string[];
  reference: Reference | null;
  premiumPct: number | null; // + means you pay (buy) / give up (sell) vs reference
  overpayUsd: number | null;
  impliedValuation: number | null;
  markValuation: number | null;
  verdict: Verdict;
  quote: Quote;
  at: number;
};

export const rpc = () => new Connection(process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com", "confirmed");

const units = (n: number, d: number) => BigInt(Math.round(n * 10 ** d));
const ui = (s: string, d: number) => Number(s) / 10 ** d;

export async function reference(asset: Asset, conn = rpc()): Promise<Reference | null> {
  if (asset.ref.source === "pyth") {
    const [p] = await readPrices(conn, [asset.ref.account]);
    if (!p) return null;
    return {
      price: p.price,
      source: `Pyth Equity.US.${asset.ref.ticker}/USD`,
      detail: "Read on-chain from the Pyth price account on Solana",
      account: p.account,
      conf: p.conf,
      ageSec: Math.max(0, Math.round(Date.now() / 1000 - p.publishTime)),
      market: marketStatus(asset.ref.schedule),
    };
  }
  if (asset.ref.source === "prestocks") {
    return {
      price: asset.ref.markPrice,
      source: "PreStocks mark price",
      detail: `Issuer mark from last private valuation ($${fmtB(asset.ref.markValuation)})`,
    };
  }
  return null;
}

export function judge(r: Omit<Rehearsal, "verdict">): Verdict {
  const reasons: string[] = [];
  const prem = r.premiumPct;
  const buy = r.side === "buy";
  const rt = r.roundTripCostPct;
  if (r.reference?.market && !r.reference.market.open && r.asset.kind === "xstock") {
    reasons.push(`${r.reference.market.label}. Pyth is carrying the latest US print, and the token can gap when trading resumes.`);
  }
  if (r.reference?.ageSec != null && r.reference.ageSec > 300) reasons.push(`The oracle price is ${Math.round(r.reference.ageSec / 60)} min old.`);
  if (r.sizeImpactPct != null && r.sizeImpactPct > 1) reasons.push(`Your size moves the price ${r.sizeImpactPct.toFixed(2)}% vs a $10 order. Splitting the order would help.`);
  if (rt != null && rt > 2) reasons.push(`Buying and selling straight back loses ${rt.toFixed(2)}%. Liquidity is thin.`);
  if (prem == null) {
    return { level: "unknown", headline: "No independent reference price for this token", reasons: ["Only the DEX route is known. Check the depth numbers before sizing up.", ...reasons] };
  }
  const abs = Math.abs(prem).toFixed(2);
  if (r.asset.kind === "prestock") {
    // Not redeemable on demand: the gap to mark is a valuation bet, not a routing mistake.
    const implied = r.impliedValuation ? ` That prices ${r.asset.name} at $${fmtB(r.impliedValuation)}, vs a $${fmtB(r.markValuation!)} mark.` : "";
    if (prem > 15) return { level: "bad", headline: `You'd buy at ${abs}% above the PreStocks mark.${implied}`, reasons: ["The token is backed by SPV exposure and can't be redeemed at mark on demand. You're paying for what the market hopes the next round is worth.", ...reasons] };
    if (prem < -15) return { level: "warn", headline: `The token trades ${abs}% below the PreStocks mark.${implied}`, reasons: ["A deep discount means sellers are leaving. Find out why before you treat it as a bargain.", ...reasons] };
    return { level: reasons.length ? "warn" : "good", headline: `Within ${abs}% of the PreStocks mark. Fair against the last valuation.`, reasons };
  }
  const line = buy
    ? `You'd pay ${abs}% ${prem >= 0 ? "above" : "below"} the Pyth price of the real stock`
    : `You'd receive ${abs}% ${prem >= 0 ? "less" : "more"} than the Pyth price of the real stock`;
  if (prem > 3) return { level: "bad", headline: `${line}. Don't market-${r.side} this size right now.`, reasons: ["xStocks are backed 1:1, so this gap is money handed to the pool.", ...reasons] };
  if (prem > 0.75) return { level: "warn", headline: `${line}. Try a smaller size or wait for US hours.`, reasons };
  return { level: reasons.length > 1 ? "warn" : "good", headline: `${line}. Fair price.`, reasons };
}

const fmtB = (v: number) => (v >= 1e12 ? `${(v / 1e12).toFixed(2)}T` : `${(v / 1e9).toFixed(0)}B`);

export async function rehearse(asset: Asset, usd: number, side: "buy" | "sell", conn = rpc()): Promise<Rehearsal | { error: string }> {
  const [ref, mults] = await Promise.all([reference(asset, conn).catch(() => null), uiMultipliers(conn, [asset.mint]).catch(() => new Map<string, number>())]);
  // Token-2022 scaled UI amount: one raw unit is `mult` shares as the wallet shows them.
  const mult = mults.get(asset.mint) ?? 1;
  const toUi = (raw: string) => ui(raw, asset.decimals) * mult;
  const toRaw = (shares: number) => units(shares / mult, asset.decimals);
  let q: Quote | { error: string };
  let tokens: number;
  let fillPrice: number;
  if (side === "buy") {
    q = await quote(USDC, asset.mint, units(usd, 6));
    if ("error" in q) return q;
    tokens = toUi(q.outAmount);
    fillPrice = usd / tokens;
  } else {
    const px = ref?.price ?? null;
    if (!px) return { error: "Selling needs a reference price to size the order" };
    tokens = usd / px;
    q = await quote(asset.mint, USDC, toRaw(tokens));
    if ("error" in q) return q;
    fillPrice = ui(q.outAmount, 6) / tokens;
  }

  // Small probe order to separate size impact from the standing spread.
  const probeUsd = Math.min(10, usd);
  const probe = side === "buy"
    ? await quote(USDC, asset.mint, units(probeUsd, 6))
    : await quote(asset.mint, USDC, toRaw(probeUsd / (ref?.price ?? fillPrice)));
  const spotPrice = "error" in probe ? null
    : side === "buy" ? probeUsd / toUi(probe.outAmount)
    : ui(probe.outAmount, 6) / toUi(probe.inAmount);

  let roundTripCostPct: number | null = null;
  if (side === "buy") {
    const back = await quote(asset.mint, USDC, BigInt(q.outAmount));
    if (!("error" in back)) roundTripCostPct = (1 - ui(back.outAmount, 6) / usd) * 100;
  }

  const premiumPct = ref ? (side === "buy" ? fillPrice / ref.price - 1 : 1 - fillPrice / ref.price) * 100 : null;
  const base = {
    asset: { symbol: asset.symbol, name: asset.name, mint: asset.mint, kind: asset.kind, icon: asset.icon },
    side, usd, tokens, fillPrice, spotPrice, uiMultiplier: mult,
    sizeImpactPct: spotPrice ? Math.abs(fillPrice / spotPrice - 1) * 100 : null,
    roundTripCostPct,
    route: q.routePlan.map((s) => s.swapInfo.label),
    reference: ref,
    premiumPct,
    overpayUsd: ref ? (side === "buy" ? usd - tokens * ref.price : tokens * ref.price - fillPrice * tokens) : null,
    impliedValuation: asset.ref.source === "prestocks" ? asset.ref.markValuation * (fillPrice / asset.ref.markPrice) : null,
    markValuation: asset.ref.source === "prestocks" ? asset.ref.markValuation : null,
    quote: q,
    at: Date.now(),
  };
  return { ...base, verdict: judge(base) };
}
