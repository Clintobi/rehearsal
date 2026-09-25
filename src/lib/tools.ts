// Tools exposed to agents over MCP (/api/mcp). Each one is also a plain REST endpoint under /api/v1.
import { buildProtectedSwap, certificate, checkTrade, executionReport, listStocks, marketOverview, officialPrints, passport, POLICY, scorecard } from "./agent";
import { preBoard } from "./prestocks";

type Schema = { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
export type Tool = {
  name: string; title: string; description: string; inputSchema: Schema;
  annotations: { readOnlyHint: boolean; openWorldHint: boolean; idempotentHint?: boolean; destructiveHint?: boolean };
  run: (a: Record<string, unknown>) => Promise<unknown>;
};

const symbol = { type: "string", description: "Token symbol (NVDAx, SPYx, OPENAI, ...), US ticker (NVDA) or mint address" };
const usd = { type: "number", minimum: 1, maximum: 1_000_000, description: "Order size in USD" };
const side = { type: "string", enum: ["buy", "sell"], default: "buy" };
const ro = { readOnlyHint: true, openWorldHint: true, idempotentHint: true };

export const TOOLS: Tool[] = [
  {
    name: "list_stocks", title: "List tokenized stocks",
    description: "Every tokenized stock Rehearsal covers on Solana (xStocks and PreStocks), with the price reference each one is judged against.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: ro,
    run: () => listStocks(),
  },
  {
    name: "passport", title: "Tradability passport",
    description: "Call this before any tokenized-stock trade. Returns what the token legally is (structure, redemption, proof of reserves), how strong the price evidence is right now (live Pyth, 24/7 perp, issuer price, mark, stale, halted), how much you could sell within 1/2/5% of the current price, the exact fill for your size vs fair value, and a decision: proceed, reduce_size, wait or avoid.",
    inputSchema: { type: "object", properties: { symbol, usd: { ...usd, default: 1000 }, side }, required: ["symbol"], additionalProperties: false }, annotations: ro,
    run: (a) => passport({ symbol: String(a.symbol), usd: Number(a.usd ?? 1000), side: a.side === "sell" ? "sell" : "buy" }),
  },
  {
    name: "check_trade", title: "Check a trade (fast)",
    description: "The passport's price check without the depth and structure lookups: exact fill for the size, gap vs the reference the policy picks for this market state, and the decision.",
    inputSchema: { type: "object", properties: { symbol, usd, side }, required: ["symbol", "usd"], additionalProperties: false }, annotations: ro,
    run: (a) => checkTrade({ symbol: String(a.symbol), usd: Number(a.usd), side: a.side === "sell" ? "sell" : "buy" }),
  },
  {
    name: "build_protected_swap", title: "Build a protected swap",
    description: "Builds an unsigned Solana transaction (base64, v0) for the wallet to sign. Jupiter's minimum output is pinned to fair value ± max_gap_bps, so the whole transaction reverts on-chain if the fill would be worse. The fair price, limit and floor are written into a memo: after sending, call verify_receipt with the signature. Refuses to build while the stock is halted or has no trustworthy reference. The mandate is max_gap_bps: an agent cannot fill past it.",
    inputSchema: { type: "object", properties: { symbol, usd, side, wallet: { type: "string", description: "Signer's public key" }, max_gap_bps: { type: "number", minimum: 0, maximum: 5000, description: "Most the fill may be worse than fair, in basis points. Defaults to the passport's suggestion." }, simulate: { type: "boolean", default: false } }, required: ["symbol", "usd", "wallet"], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: (a) => buildProtectedSwap({ symbol: String(a.symbol), usd: Number(a.usd), side: a.side === "sell" ? "sell" : "buy", wallet: String(a.wallet), maxGapBps: a.max_gap_bps != null ? Number(a.max_gap_bps) : undefined, simulate: a.simulate === true }),
  },
  {
    name: "verify_receipt", title: "Verify a receipt",
    description: "Re-reads a confirmed protected swap on Solana, decodes the receipt memo and checks what the wallet actually received against the floor. Returns verified true/false with the fill price and gap vs the fair price written into the transaction.",
    inputSchema: { type: "object", properties: { signature: { type: "string" } }, required: ["signature"], additionalProperties: false }, annotations: ro,
    run: (a) => certificate(String(a.signature)),
  },
  {
    name: "market_status", title: "Market status",
    description: "US session state per stock (from the issuer's own calendar), Nasdaq and issuer halts, on-chain circuit breakers, 24/7 perp prices, the opening/closing cross rules and any official open/close prints written on-chain.",
    inputSchema: { type: "object", properties: { symbol: { type: "string", description: "Optional xStock symbol or ticker" } }, additionalProperties: false }, annotations: ro,
    run: async (a) => {
      const [m, prints] = await Promise.all([marketOverview(a.symbol ? String(a.symbol) : undefined), officialPrints().catch(() => [])]);
      return { ...m, officialPrints: prints };
    },
  },
  {
    name: "price_policy", title: "Price policy",
    description: "The published rules for which price a trade is judged against in each market state, and when protection refuses.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: ro,
    run: async () => POLICY,
  },
  {
    name: "prestocks_research", title: "Pre-IPO research",
    description: "Every PreStocks token: what its price values the private company at, premium to PreStocks' mark, the listing value needed to break even after the 1% fees, and float. Pass a symbol for that company's full passport too.",
    inputSchema: { type: "object", properties: { symbol: { type: "string" } }, additionalProperties: false }, annotations: ro,
    run: async (a) => {
      const rows = await preBoard();
      if (!a.symbol) return { rows };
      const s = String(a.symbol).toUpperCase();
      return { row: rows.find((r) => r.symbol === s) ?? null, passport: await passport({ symbol: s, usd: 1000 }) };
    },
  },
  {
    name: "execution_report", title: "Execution report",
    description: "The public execution-quality report: how real fills on Solana compared with fair value, by token, session and size, with bots excluded. The dataset hash is committed on Solana and the report is ZK-proven.",
    inputSchema: { type: "object", properties: { symbol: { type: "string" } }, additionalProperties: false }, annotations: ro,
    run: (a) => executionReport(a.symbol ? String(a.symbol) : undefined),
  },
  {
    name: "agent_scorecard", title: "Wallet scorecard",
    description: "A wallet's sampled tokenized-stock fills graded against fair value: count, median gap, share within 25 bps and 5-minute markouts. Use it to audit an agent or a bot you're considering following.",
    inputSchema: { type: "object", properties: { wallet: { type: "string" } }, required: ["wallet"], additionalProperties: false }, annotations: ro,
    run: (a) => scorecard(String(a.wallet)),
  },
];
