// The passport layer: one set of functions behind the app, the REST API (/api/v1) and the MCP
// server (/api/mcp). For any tokenized stock it answers what you hold, how good the price
// evidence is right now, whether you can get out at your size, and builds a swap that cannot
// fill worse than fair value, with the terms written into the transaction as a receipt.
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, type AddressLookupTableAccount } from "@solana/web3.js";
import { allAssets, type Asset } from "./assets";
import { quote, swapInstructions, USDC, type Quote } from "./jup";
import { rehearse, rpc, type Rehearsal } from "./rehearse";
import { marketStatus } from "./market";
import { haltBoard } from "./halts";
import { mintInfos } from "./mintinfo";
import { toIx, type JupSwapIxs } from "./guard";
import { STRUCTURES, type Structure } from "./structure";
import { perpReference, xstockActions, xstockReserves, xstockSession, type CorporateAction, type Perp, type Reserves, type Session } from "./signals";

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const PYTH_MAX_AGE_SECS = 180;

export async function findAsset(symbolOrMint: string) {
  const s = symbolOrMint.trim().toLowerCase();
  const all = await allAssets();
  return all.find((a) => a.symbol.toLowerCase() === s || a.mint.toLowerCase() === s || a.ticker?.toLowerCase() === s)
    ?? all.find((a) => a.symbol.toLowerCase() === `${s}x` || a.name.toLowerCase() === s);
}

export type StockRow = { symbol: string; name: string; kind: Asset["kind"]; issuer: string; mint: string; ticker: string | null; reference: string };
export async function listStocks(): Promise<StockRow[]> {
  return (await allAssets()).map((a) => ({
    symbol: a.symbol, name: a.name, kind: a.kind, issuer: a.issuer, mint: a.mint, ticker: a.ticker ?? null,
    reference: a.pyth ? `Pyth Equity.US.${a.pyth.ticker}/USD (on-chain)` : a.mark ? "PreStocks mark" : "xStocks issuer price",
  }));
}

// ---------------------------------------------------------------------------------------------
// Reference policy: which price a trade is judged against, by market state. Published at /api/v1/policy.

export type EvidenceLevel = "live" | "perp" | "issuer" | "mark" | "stale" | "halted";
export type Evidence = {
  level: EvidenceLevel;
  tradeable: boolean; // false = protection refuses to build a swap
  price: number | null;
  source: string;
  code: "P" | "L" | "I" | "M" | "-"; // compact code written into receipts
  ageSec: number | null;
  rule: string;
};

export const POLICY = {
  version: 1,
  rules: [
    { state: "US regular session, Pyth price fresh", reference: "Pyth Equity.US price account, read on-chain", level: "live", maxAgeSecs: PYTH_MAX_AGE_SECS },
    { state: "US market closed, pre-market, after hours or overnight", reference: "Lighter 24/7 perpetual mark price for the same stock", level: "perp" },
    { state: "Regular session, Pyth stale", reference: "Lighter perp mark if listed, otherwise refuse", level: "perp or stale" },
    { state: "No on-chain Pyth feed (listed company)", reference: "xStocks issuer reference price. Weaker evidence, shown as such.", level: "issuer" },
    { state: "Pre-IPO (PreStocks)", reference: "PreStocks mark: a valuation, not a market price. Limits are measured against it.", level: "mark" },
    { state: "Halted by Nasdaq or by the issuer", reference: "None. Protection refuses to build a swap.", level: "halted" },
    { state: "Market closed and no 24/7 reference", reference: "None. Protection refuses; the unprotected quote is still shown.", level: "stale" },
  ],
  note: "Pyth's free on-chain equity feeds update in the regular US session only, and 63% of Solana tokenized-stock volume trades outside it (Allium, 12 months to 18 Aug 2026). Outside the session a 24/7 perp is the best live estimate of the stock.",
};

function evidenceFor(r: Rehearsal, kind: Asset["kind"], regular: boolean | null, perp: Perp | null, halted: boolean): Evidence {
  if (halted) return { level: "halted", tradeable: false, price: null, source: "Halted", code: "-", ageSec: null, rule: "Halted by Nasdaq or the issuer" };
  if (kind === "prestock") {
    return r.reference
      ? { level: "mark", tradeable: true, price: r.reference.price, source: "PreStocks mark", code: "M", ageSec: null, rule: "Pre-IPO, so limits are measured against the PreStocks mark" }
      : { level: "stale", tradeable: false, price: null, source: "No mark", code: "-", ageSec: null, rule: "No PreStocks mark available" };
  }
  const pyth = r.reference?.source.startsWith("Pyth") ? r.reference : null;
  const fresh = pyth && (pyth.ageSec ?? Infinity) <= PYTH_MAX_AGE_SECS;
  if (regular && fresh) return { level: "live", tradeable: true, price: pyth!.price, source: pyth!.source, code: "P", ageSec: pyth!.ageSec ?? null, rule: "Regular session: the live Pyth price is used" };
  if (perp) return { level: "perp", tradeable: true, price: perp.mark, source: `Lighter ${perp.symbol} perp mark`, code: "L", ageSec: 0, rule: regular ? "Pyth price is stale, so the 24/7 perp mark is used" : "Outside the regular session, the 24/7 perp mark is used" };
  if (regular && r.reference && !pyth) return { level: "issuer", tradeable: true, price: r.reference.price, source: r.reference.source, code: "I", ageSec: null, rule: "No on-chain Pyth feed, so the issuer's reference price is used" };
  return { level: "stale", tradeable: false, price: r.reference?.price ?? null, source: r.reference?.source ?? "None", code: "-", ageSec: r.reference?.ageSec ?? null, rule: "Outside the regular session with no 24/7 reference, the last price may be hours old" };
}

// ---------------------------------------------------------------------------------------------
// Exit capacity: how much you could sell before the price you get drops 1%, 2% or 5% below the
// current price, from a ladder of real sell quotes. Cached for 5 minutes per token.

export type ExitCapacity = {
  basePrice: number; // $ per share on a $100 sell
  within: { pct: number; usd: number | null; capped: boolean }[]; // largest sell inside each band; capped = deeper than the ladder
  ladder: { usd: number; impactPct: number | null }[];
  largestWallet: { shares: number; usd: number; exitableAt5Pct: number | null } | null;
  asOf: string;
};

const exitCache = new Map<string, { at: number; v: ExitCapacity | null }>();
const LADDER = [100, 1_000, 5_000, 25_000, 100_000, 250_000];

export async function exitCapacity(asset: Asset, refPrice: number, conn: Connection = rpc()): Promise<ExitCapacity | null> {
  const hit = exitCache.get(asset.mint);
  if (hit && Date.now() - hit.at < 300_000) return hit.v;
  try {
    const info = (await mintInfos(conn, [asset.mint])).get(asset.mint) ?? { multiplier: 1, transferFeeBps: 0 };
    const keep = 1 - info.transferFeeBps / 10_000;
    const sellQuote = async (usd: number) => {
      const shares = usd / refPrice;
      const raw = BigInt(Math.floor((shares / info.multiplier) * 10 ** asset.decimals * keep));
      if (raw <= 0n) return null;
      const q = await quote(asset.mint, USDC, raw);
      return "error" in q ? null : Number(q.outAmount) / 1e6 / shares; // $ per share received
    };
    const prices: (number | null)[] = [];
    for (const u of LADDER) prices.push(await sellQuote(u)); // sequential: Jupiter rate limits bursts
    const base = prices[0];
    if (!base) { exitCache.set(asset.mint, { at: Date.now(), v: null }); return null; }
    const ladder = LADDER.map((usd, i) => ({ usd, impactPct: prices[i] == null ? null : round((1 - prices[i]! / base) * 100, 3) }));
    // Largest ladder size inside the band, interpolated in log-size to the band edge.
    const within = [1, 2, 5].map((pct) => {
      let last: number | null = null;
      for (let i = 0; i < ladder.length; i++) {
        const imp = ladder[i].impactPct;
        if (imp == null || imp > pct) {
          if (last == null || i === 0 || ladder[i - 1].impactPct == null || imp == null) return { pct, usd: last, capped: false };
          const [x0, y0, x1, y1] = [Math.log(ladder[i - 1].usd), ladder[i - 1].impactPct!, Math.log(ladder[i].usd), imp];
          const x = x0 + ((pct - y0) / (y1 - y0 || 1)) * (x1 - x0);
          return { pct, usd: Math.round(Math.exp(Math.min(Math.max(x, x0), x1))), capped: false };
        }
        last = ladder[i].usd;
      }
      return { pct, usd: last, capped: true };
    });

    // Biggest wallet holder. Token accounts owned by programs (pool vaults) are skipped, and so are
    // issuer-sized holdings over 20% of supply, which are custody or treasury wallets, not traders.
    let largestWallet: ExitCapacity["largestWallet"] = null;
    try {
      const [topRes, supply] = await Promise.all([conn.getTokenLargestAccounts(new PublicKey(asset.mint)), conn.getTokenSupply(new PublicKey(asset.mint))]);
      const total = Number(supply.value.amount);
      const top = topRes.value.filter((t) => Number(t.amount) <= total * 0.2).slice(0, 12);
      const parsed = await conn.getMultipleParsedAccounts(top.map((t) => t.address));
      for (let i = 0; i < top.length; i++) {
        const owner = (parsed.value[i]?.data as { parsed?: { info?: { owner?: string } } } | undefined)?.parsed?.info?.owner;
        if (!owner || !PublicKey.isOnCurve(new PublicKey(owner).toBytes())) continue;
        const shares = (Number(top[i].amount) / 10 ** asset.decimals) * info.multiplier;
        const usd = shares * refPrice;
        const five = within.find((w) => w.pct === 5)!;
        largestWallet = { shares: round(shares, 4), usd: Math.round(usd), exitableAt5Pct: five.usd != null && usd > 0 ? round(Math.min(1, five.usd / usd) * 100, 1) : null };
        break;
      }
    } catch { /* holder lookup is best effort */ }

    const v: ExitCapacity = { basePrice: round(base, 6), within, ladder, largestWallet, asOf: new Date().toISOString() };
    exitCache.set(asset.mint, { at: Date.now(), v });
    return v;
  } catch {
    return hit?.v ?? null;
  }
}

// ---------------------------------------------------------------------------------------------
// Check and passport

export type Action = "proceed" | "reduce_size" | "wait" | "avoid";

export type Check = {
  symbol: string; name: string; kind: Asset["kind"]; issuer: string; mint: string; side: "buy" | "sell"; usd: number;
  decision: { action: Action; headline: string; reasons: string[] };
  evidence: Evidence;
  fill: { price: number; shares: number; route: string[]; sizeImpactPct: number | null; roundTripCostPct: number | null; gapPct: number | null; overpayUsd: number | null };
  pyth: { price: number; source: string; ageSec: number | null } | null;
  perp: Perp | null;
  costs: { transferFeeBps: number; uiMultiplier: number };
  market: { regular: boolean | null; label: string; session: Session | null; nasdaqHalt: { reason: string | null; at: string | null } | null };
  prestock: { markPrice: number; markValuation: number; impliedValuation: number | null } | null;
  protect: { available: boolean; maxGapBps: number; note: string };
  asOf: string;
};

const SESSION_LABEL: Record<string, string> = { market: "US market open", extended: "Extended hours", overnight: "Overnight session", closed: "US market closed" };

async function runCheck(asset: Asset, usd: number, side: "buy" | "sell") {
  const ticker = asset.ticker ?? null;
  const [r, session, perp, halts] = await Promise.all([
    rehearse(asset, usd, side),
    asset.kind === "xstock" ? xstockSession(asset.symbol) : Promise.resolve(null),
    ticker ? perpReference(ticker) : Promise.resolve(null),
    haltBoard().catch(() => null),
  ]);
  if ("error" in r) return { error: r.error } as const;

  const pythStatus = asset.pyth ? marketStatus(asset.pyth.schedule) : null;
  // xStocks' own calendar knows holidays; Pyth's schedule is the fallback.
  const regular = asset.kind === "prestock" ? null : session ? session.period === "market" : pythStatus ? pythStatus.open : null;
  const label = asset.kind === "prestock" ? "Private company: no exchange session"
    : session ? SESSION_LABEL[session.period] ?? session.period : pythStatus?.label ?? "Unknown";
  const nasdaq = ticker ? halts?.rows.find((h) => h.ticker === ticker)?.nasdaq : undefined;
  const nasdaqHalt = nasdaq?.halted ? { reason: nasdaq.reason, at: nasdaq.at } : null;
  const halted = !!(session?.issuerHalted || nasdaqHalt);
  const evidence = evidenceFor(r, asset.kind, regular, perp, halted);

  const gapPct = evidence.price != null ? round((side === "buy" ? r.fillPrice / evidence.price - 1 : 1 - r.fillPrice / evidence.price) * 100, 3) : null;
  const overpayUsd = evidence.price != null ? round(side === "buy" ? usd - r.tokens * evidence.price : r.tokens * evidence.price - r.fillPrice * r.tokens, 2) : null;

  // Decision for people and agents.
  const reasons: string[] = [];
  let action: Action = "proceed";
  const src = evidence.level === "perp" ? "the 24/7 perp price" : evidence.level === "mark" ? "the PreStocks mark" : evidence.level === "issuer" ? "the issuer's price" : "the real stock's price";
  let headline = gapPct == null ? "No trustworthy fair price right now."
    : Math.abs(gapPct) < 0.15 ? `Fair price: within ${Math.abs(gapPct).toFixed(2)}% of ${src}.`
    : gapPct < 0 ? `Better than fair: ${Math.abs(gapPct).toFixed(2)}% ${side === "buy" ? "below" : "above"} ${src}.`
    : `You'd ${side === "buy" ? "pay" : "give up"} ${gapPct.toFixed(2)}% ${side === "buy" ? "above" : "below"} ${src}.`;
  const rank: Action[] = ["proceed", "reduce_size", "wait", "avoid"];
  const bump = (a: Action) => { if (rank.indexOf(a) > rank.indexOf(action)) action = a; };
  const xs = asset.kind === "xstock";
  const [warnAt, badAt] = xs ? [0.75, 3] : [5, 15];
  if (halted) {
    bump("wait");
    headline = `${asset.name} is halted${nasdaqHalt ? ` on Nasdaq (${nasdaqHalt.reason ?? "no reason code"})` : " by the issuer"}. Pool prices during a halt aren't anchored to anything.`;
  } else if (gapPct == null) {
    bump("wait");
    reasons.push("No trustworthy fair price right now, so the fill can't be checked.");
  } else if (gapPct >= badAt) {
    if (r.sizeImpactPct != null && r.sizeImpactPct > 1 && gapPct - r.sizeImpactPct < warnAt) {
      bump("reduce_size"); reasons.push(`Most of the ${gapPct.toFixed(2)}% gap is your own size moving the pool. Split the order.`);
    } else {
      bump(xs && regular === false ? "wait" : "avoid"); reasons.push(`The fill is ${gapPct.toFixed(2)}% worse than fair value (${evidence.source}).`);
    }
  } else if (gapPct >= warnAt) {
    bump(r.sizeImpactPct != null && r.sizeImpactPct > 0.5 ? "reduce_size" : xs && regular === false ? "wait" : "proceed");
    reasons.push(`The fill is ${gapPct.toFixed(2)}% worse than fair value (${evidence.source}).`);
  }
  if (xs && regular === false) reasons.push(evidence.level === "perp"
    ? `${label}. Judged against the 24/7 ${ticker} perp at $${evidence.price!.toFixed(2)}, not Friday's close.`
    : `${label} and no 24/7 reference for ${ticker}. The last price may be hours old.`);
  if (r.roundTripCostPct != null && r.roundTripCostPct > 2) reasons.push(`Buying and selling straight back loses ${r.roundTripCostPct.toFixed(2)}%. Liquidity is thin.`);
  if (!xs) reasons.push("PreStocks can't be redeemed at the mark on demand and pay a 1% fee on every transfer, so the gap to the mark is a valuation call.");

  const curBps = gapPct != null ? Math.round(gapPct * 100) : 0;
  const maxGapBps = xs ? Math.max(50, Math.min(300, curBps + 25)) : Math.max(150, Math.min(5000, curBps + 100));

  const check: Check = {
    symbol: asset.symbol, name: asset.name, kind: asset.kind, issuer: asset.issuer, mint: asset.mint, side, usd,
    decision: { action, headline, reasons },
    evidence,
    fill: { price: round(r.fillPrice, 6), shares: round(r.tokens, 8), route: r.route, sizeImpactPct: r.sizeImpactPct != null ? round(r.sizeImpactPct, 3) : null, roundTripCostPct: r.roundTripCostPct != null ? round(r.roundTripCostPct, 3) : null, gapPct, overpayUsd },
    pyth: r.reference?.source.startsWith("Pyth") ? { price: r.reference.price, source: r.reference.source, ageSec: r.reference.ageSec ?? null } : null,
    perp,
    costs: { transferFeeBps: r.transferFeeBps, uiMultiplier: r.uiMultiplier },
    market: { regular, label, session, nasdaqHalt },
    prestock: asset.mark ? { markPrice: asset.mark.price, markValuation: asset.mark.valuation, impliedValuation: r.impliedValuation } : null,
    protect: {
      available: evidence.tradeable,
      maxGapBps,
      note: evidence.tradeable
        ? `A protected swap with max_gap_bps=${maxGapBps} reverts on-chain if you'd receive less than fair value ${side === "buy" ? "+" : "−"} ${(maxGapBps / 100).toFixed(2)}% implies.`
        : `Protection is off: ${evidence.rule.toLowerCase()}.`,
    },
    asOf: new Date(r.at).toISOString(),
  };
  return { check, r, asset };
}

export async function checkTrade(input: { symbol: string; usd: number; side?: "buy" | "sell" }): Promise<Check | { error: string }> {
  const asset = await findAsset(input.symbol);
  if (!asset) return { error: `Unknown stock "${input.symbol}". Call list_stocks for the supported symbols.` };
  const usd = Number(input.usd);
  if (!(usd >= 1 && usd <= 1_000_000)) return { error: "usd must be between 1 and 1,000,000" };
  const out = await runCheck(asset, usd, input.side === "sell" ? "sell" : "buy");
  return "error" in out ? { error: out.error! } : out.check;
}

export type Passport = Check & {
  holds: Structure & { issuer: string; reserves: Reserves | null; corporateActions: CorporateAction[]; multiplier: number; transferFeeBps: number };
  exit: ExitCapacity | null;
};

export async function passport(input: { symbol: string; usd?: number; side?: "buy" | "sell"; exit?: boolean }): Promise<Passport | { error: string }> {
  const asset = await findAsset(input.symbol);
  if (!asset) return { error: `Unknown stock "${input.symbol}". Call list_stocks for the supported symbols.` };
  const usd = Number(input.usd ?? 1000);
  if (!(usd >= 1 && usd <= 1_000_000)) return { error: "usd must be between 1 and 1,000,000" };
  const out = await runCheck(asset, usd, input.side === "sell" ? "sell" : "buy");
  if ("error" in out) return { error: out.error! };
  const { check } = out;
  const xs = asset.kind === "xstock";
  const ref = check.fill.price; // exit capacity is about market depth, so size it at the market price
  const [reserves, actions, exit] = await Promise.all([
    xs ? xstockReserves(asset.symbol) : Promise.resolve(null),
    xs ? xstockActions(asset.symbol) : Promise.resolve([]),
    input.exit === false ? Promise.resolve(null) : exitCapacity(asset, ref),
  ]);
  if (reserves && reserves.coverage < 0.995) {
    check.decision.reasons.unshift(`Proof of reserves shows ${(reserves.coverage * 100).toFixed(2)}% backing, below 1:1.`);
    if (check.decision.action === "proceed") check.decision.action = "wait";
  }
  const soon = actions.find((a) => a.multiplierNew != null && Date.parse(a.effective) > Date.now() && Date.parse(a.effective) - Date.now() < 36 * 3600_000);
  if (soon) check.decision.reasons.push(`The token's share multiplier changes from ${soon.multiplierOld} to ${soon.multiplierNew} at ${soon.effective}. Pools can misprice around the switch.`);
  return {
    ...check,
    holds: { ...STRUCTURES[asset.issuer], issuer: asset.issuer, reserves, corporateActions: actions.slice(0, 3), multiplier: check.costs.uiMultiplier, transferFeeBps: check.costs.transferFeeBps },
    exit,
  };
}

// ---------------------------------------------------------------------------------------------
// Protected swap: Jupiter's route with the minimum output set from fair value, not from the quote.
// Jupiter's program checks what actually lands in the wallet (after Token-2022 fees) and reverts
// the whole transaction below it. The terms go into a memo, so the receipt lives on-chain.

export type Receipt = {
  version: 1; symbol: string; side: "buy" | "sell"; usd: number; wallet: string;
  fairPrice: number; fairSource: string; rule: string; evidence: EvidenceLevel;
  maxGapBps: number; worstPrice: number;
  minimumReceived: { raw: string; ui: number; unit: string };
  quotedReceived: number; headroomPct: number; builtAt: string; memo: string | null;
};

export type ProtectedSwap = { transaction: string; lastValidBlockHeight: number; receipt: Receipt; check: Pick<Check, "decision" | "fill" | "evidence">; simulation: { ok: boolean; error: string | null; logs: string[] } | null };

export function encodeMemo(r: { symbol: string; side: "buy" | "sell"; fair: number; code: string; maxGapBps: number; minRaw: bigint; t: number }) {
  return `rh1|${r.symbol}|${r.side === "buy" ? "b" : "s"}|${r.fair.toFixed(6)}|${r.code}|${r.maxGapBps}|${r.minRaw}|${r.t}`;
}
export function decodeMemo(s: string) {
  const m = s.match(/rh1\|([^|]+)\|([bs])\|([\d.]+)\|([PLIM-])\|(\d+)\|(\d+)\|(\d+)/);
  if (!m) return null;
  return { symbol: m[1], side: m[2] === "b" ? "buy" as const : "sell" as const, fair: Number(m[3]), code: m[4], maxGapBps: Number(m[5]), minRaw: BigInt(m[6]), t: Number(m[7]) };
}

// Assemble Jupiter's instructions (plus our own) into one v0 transaction for `payer` to sign.
export async function assembleSwap(conn: Connection, jup: JupSwapIxs, payer: PublicKey, extra: TransactionInstruction[] = []) {
  const alts = (await Promise.all(jup.addressLookupTableAddresses.map((a) => conn.getAddressLookupTable(new PublicKey(a)))))
    .map((r) => r.value).filter((v): v is AddressLookupTableAccount => !!v);
  const ixs = [
    ...jup.computeBudgetInstructions.map(toIx),
    ...jup.setupInstructions.map(toIx),
    toIx(jup.swapInstruction),
    ...(jup.cleanupInstruction ? [toIx(jup.cleanupInstruction)] : []),
    ...(jup.otherInstructions ?? []).map(toIx),
    ...extra,
  ];
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(alts));
  return { tx, lastValidBlockHeight };
}

// Jupiter enforces minimum out = outAmount × (1 − slippageBps). Pick the slippage that lands on `minRaw`.
export function floorQuote(q: Quote, minRaw: bigint): Quote {
  const out = BigInt(q.outAmount);
  const slippageBps = Math.max(0, Number(((out - minRaw) * 10_000n) / out));
  return { ...q, slippageBps, otherAmountThreshold: String((out * BigInt(10_000 - slippageBps)) / 10_000n) } as Quote;
}

export async function buildProtectedSwap(input: { symbol: string; usd: number; side?: "buy" | "sell"; wallet: string; maxGapBps?: number; simulate?: boolean; conn?: Connection }): Promise<ProtectedSwap | { error: string; check?: Check }> {
  let owner: PublicKey;
  try { owner = new PublicKey(input.wallet); } catch { return { error: "wallet must be a Solana public key" }; }
  const asset = await findAsset(input.symbol);
  if (!asset) return { error: `Unknown stock "${input.symbol}"` };
  const usd = Number(input.usd);
  if (!(usd >= 1 && usd <= 1_000_000)) return { error: "usd must be between 1 and 1,000,000" };
  const out = await runCheck(asset, usd, input.side === "sell" ? "sell" : "buy");
  if ("error" in out) return { error: out.error! };
  const { check, r } = out;
  const ev = check.evidence;
  if (!ev.tradeable || ev.price == null) return { error: `Protection is off for ${asset.symbol} right now: ${ev.rule}.`, check };
  const maxGapBps = Math.round(input.maxGapBps ?? check.protect.maxGapBps);
  if (!(maxGapBps >= 0 && maxGapBps <= 5000)) return { error: "max_gap_bps must be between 0 and 5000" };

  const side = check.side;
  const keep = 1 - r.transferFeeBps / 10_000;
  let minRaw: bigint, quotedReceivedRaw: number, worstPrice: number, unit: string, minUi: number;
  if (side === "buy") {
    worstPrice = ev.price * (1 + maxGapBps / 10_000);
    minUi = usd / worstPrice;
    minRaw = BigInt(Math.ceil((minUi / r.uiMultiplier) * 10 ** asset.decimals));
    quotedReceivedRaw = Number(r.quote.outAmount) * keep; // lands in the wallet after the transfer fee
    unit = asset.symbol;
  } else {
    worstPrice = ev.price * (1 - maxGapBps / 10_000);
    minUi = r.tokens * worstPrice;
    minRaw = BigInt(Math.ceil(minUi * 1e6));
    quotedReceivedRaw = Number(r.quote.outAmount);
    unit = "USDC";
  }
  if (quotedReceivedRaw < Number(minRaw)) {
    const worse = side === "buy" ? (r.fillPrice / ev.price - 1) * 100 : (1 - r.fillPrice / ev.price) * 100;
    return { error: `Refused: the best route right now is ${worse.toFixed(2)}% worse than fair value (${ev.source}), past your ${(maxGapBps / 100).toFixed(2)}% limit. A swap built now would revert.`, check };
  }

  const conn = input.conn ?? rpc();
  const jup = await swapInstructions(floorQuote(r.quote, minRaw), owner.toBase58());
  if (jup.error || !jup.swapInstruction) return { error: jup.error ?? "Jupiter could not build this swap", check };
  const t = Math.floor(Date.now() / 1000);
  const memo = encodeMemo({ symbol: asset.symbol, side, fair: ev.price, code: ev.code, maxGapBps, minRaw, t });
  const memoIx = new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(memo, "utf8") });
  let built: Awaited<ReturnType<typeof assembleSwap>>;
  let memoUsed: string | null = memo;
  try {
    built = await assembleSwap(conn, jup, owner, [memoIx]);
    built.tx.serialize();
  } catch {
    built = await assembleSwap(conn, jup, owner); // too large with the memo: the receipt stays off-chain
    memoUsed = null;
  }

  let simulation: ProtectedSwap["simulation"] = null;
  if (input.simulate) {
    try {
      const s = await conn.simulateTransaction(built.tx, { sigVerify: false, replaceRecentBlockhash: true });
      simulation = { ok: !s.value.err, error: s.value.err ? JSON.stringify(s.value.err) : null, logs: (s.value.logs ?? []).slice(-6) };
    } catch (e) { simulation = { ok: false, error: String(e).slice(0, 200), logs: [] }; }
  }

  const receipt: Receipt = {
    version: 1, symbol: asset.symbol, side, usd, wallet: owner.toBase58(),
    fairPrice: round(ev.price, 6), fairSource: ev.source, rule: ev.rule, evidence: ev.level,
    maxGapBps, worstPrice: round(worstPrice, 6),
    minimumReceived: { raw: minRaw.toString(), ui: round(minUi, 8), unit },
    quotedReceived: round(side === "buy" ? (quotedReceivedRaw / 10 ** asset.decimals) * r.uiMultiplier : quotedReceivedRaw / 1e6, 8),
    headroomPct: round((quotedReceivedRaw / Number(minRaw) - 1) * 100, 3),
    builtAt: new Date(t * 1000).toISOString(), memo: memoUsed,
  };
  return {
    transaction: Buffer.from(built.tx.serialize()).toString("base64"), lastValidBlockHeight: built.lastValidBlockHeight,
    receipt, check: { decision: check.decision, fill: check.fill, evidence: check.evidence }, simulation,
  };
}

// ---------------------------------------------------------------------------------------------
// Certificate: re-read a confirmed transaction, find the receipt memo and check the fill against it.

export async function certificate(sig: string, conn: Connection = rpc()) {
  const tx = await conn.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  if (!tx) return { error: "Transaction not found (yet). Try again in a few seconds." };
  const memoText = [...(tx.meta?.logMessages ?? [])].map((l) => l.match(/Memo \(len \d+\): "(.*)"/)?.[1]).find((m) => m?.startsWith("rh1|"));
  const memo = memoText ? decodeMemo(memoText) : null;
  if (!memo) return { error: "No Rehearsal receipt in this transaction." };
  const asset = await findAsset(memo.symbol);
  if (!asset) return { error: `Unknown stock ${memo.symbol}` };
  const payer = tx.transaction.message.accountKeys[0].pubkey.toBase58();
  const delta = (mint: string) => {
    let pre = 0n, post = 0n;
    for (const b of tx.meta?.preTokenBalances ?? []) if (b.mint === mint && b.owner === payer) pre += BigInt(b.uiTokenAmount.amount);
    for (const b of tx.meta?.postTokenBalances ?? []) if (b.mint === mint && b.owner === payer) post += BigInt(b.uiTokenAmount.amount);
    return post - pre;
  };
  const info = (await mintInfos(conn, [asset.mint]).catch(() => new Map())).get(asset.mint) ?? { multiplier: 1 };
  const stockRaw = delta(asset.mint), usdcRaw = delta(USDC);
  const received = memo.side === "buy" ? stockRaw : usdcRaw;
  const shares = (Number(memo.side === "buy" ? stockRaw : -stockRaw) / 10 ** asset.decimals) * info.multiplier;
  const usdAmt = Number(memo.side === "buy" ? -usdcRaw : usdcRaw) / 1e6;
  const fillPrice = shares > 0 ? usdAmt / shares : null;
  const gapPct = fillPrice != null ? (memo.side === "buy" ? fillPrice / memo.fair - 1 : 1 - fillPrice / memo.fair) * 100 : null;
  return {
    signature: sig, slot: tx.slot, blockTime: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null,
    succeeded: !tx.meta?.err, wallet: payer, symbol: memo.symbol, side: memo.side,
    terms: { fairPrice: memo.fair, source: { P: "Pyth (on-chain)", L: "Lighter perp mark", I: "xStocks issuer price", M: "PreStocks mark", "-": "none" }[memo.code] ?? memo.code, maxGapBps: memo.maxGapBps, minimumReceivedRaw: memo.minRaw.toString(), builtAt: new Date(memo.t * 1000).toISOString() },
    result: { receivedRaw: received.toString(), shares: round(shares, 8), usd: round(usdAmt, 6), fillPrice: fillPrice != null ? round(fillPrice, 6) : null, gapPct: gapPct != null ? round(gapPct, 3) : null },
    verified: !tx.meta?.err && received >= memo.minRaw,
    explain: !tx.meta?.err
      ? `Received ${received} raw units against a floor of ${memo.minRaw}: the fill was ${gapPct != null ? `${gapPct >= 0 ? gapPct.toFixed(2) + "% worse" : Math.abs(gapPct).toFixed(2) + "% better"} than` : "checked against"} the fair price written into the transaction.`
      : "The transaction reverted, so nothing was traded. That is the protection working if the fill would have been worse than the floor.",
  };
}

// ---------------------------------------------------------------------------------------------
// Market status and report (for agents)

const NY = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));

export function todaysClose(now = new Date()): string | null {
  const p = NY(now);
  if (p.weekday === "Sat" || p.weekday === "Sun") return null;
  for (const off of [4, 5]) {
    const t = new Date(`${p.year}-${p.month}-${p.day}T${String(16 + off).padStart(2, "0")}:00:00Z`);
    if (NY(t).hour === "16") return t.toISOString();
  }
  return null;
}

export async function marketOverview(symbol?: string) {
  const assets = (await allAssets()).filter((a) => a.kind === "xstock");
  const pick = symbol ? assets.filter((a) => a.symbol.toLowerCase() === symbol.toLowerCase() || a.ticker?.toLowerCase() === symbol.toLowerCase()) : assets;
  if (symbol && !pick.length) return { error: `Unknown xStock "${symbol}"` };
  const halts = await haltBoard().catch(() => null);
  const rows = await Promise.all(pick.map(async (a) => {
    const [session, perp] = await Promise.all([xstockSession(a.symbol), a.ticker ? perpReference(a.ticker) : Promise.resolve(null)]);
    const h = halts?.rows.find((x) => x.ticker === a.ticker);
    return {
      symbol: a.symbol, ticker: a.ticker ?? null, session,
      halted: !!(session?.issuerHalted || h?.nasdaq.halted),
      nasdaq: h?.nasdaq ?? null,
      breaker: h?.breaker ? { cluster: halts!.cluster, ...h.breaker } : null,
      perp: perp ? { venue: perp.venue, mark: perp.mark, volume24hUsd: Math.round(perp.volume24hUsd) } : null,
    };
  }));
  const close = todaysClose();
  return {
    asOf: new Date().toISOString(),
    crosses: {
      closing: close ? { at: close, windowSecs: 300, rule: "At-close orders match at the last Pyth print published at or before 16:00 New York, from 16:00 to 16:05. The close price is written on-chain (ClosingCross account)." } : null,
      opening: { rule: "At-open orders match at the first Pyth print after at least 30 minutes of silence (weekends, holidays), for 5 minutes (OpeningCross account)." },
    },
    rows,
  };
}

const REPORT_URL = process.env.NEXT_PUBLIC_REPORT_URL ?? "https://gist.githubusercontent.com/Clintobi/7b15feb84f4634fa5ef05eec7e248f9c/raw/report.json";

export async function executionReport(symbol?: string) {
  const r = await (await fetch(`${REPORT_URL}?t=${Math.floor(Date.now() / 60_000)}`, { cache: "no-store" })).json();
  const pickTok = (t: { symbol?: string; key?: string }) => !symbol || (t.symbol ?? t.key ?? "").toLowerCase() === symbol.toLowerCase();
  return {
    generatedAt: new Date(r.generated_at * 1000).toISOString(),
    coverage: r.coverage, overall: r.overall, bySession: r.by_session, bySize: r.by_size,
    byToken: Array.isArray(r.by_token) ? r.by_token.filter(pickTok) : r.by_token,
    method: r.method, dataset: r.dataset,
    page: "https://rehearsal-stocklana.vercel.app/report",
  };
}
