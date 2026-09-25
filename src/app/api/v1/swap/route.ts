import { NextRequest } from "next/server";
import { buildProtectedSwap } from "@/lib/agent";
import { json, options } from "@/lib/api";

export const maxDuration = 60;

// POST /api/v1/swap {symbol, usd, side, wallet, maxGapBps?, simulate?}
// Returns an unsigned transaction whose minimum output is pinned to fair value, plus its receipt.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (!b?.symbol || !b?.wallet) return json({ error: "symbol and wallet are required" }, 400);
  const r = await buildProtectedSwap({ symbol: String(b.symbol), usd: Number(b.usd), side: b.side === "sell" ? "sell" : "buy", wallet: String(b.wallet), maxGapBps: b.maxGapBps != null ? Number(b.maxGapBps) : undefined, simulate: b.simulate === true });
  return json(r, "error" in r ? 422 : 200, { "Cache-Control": "no-store" });
}
export const OPTIONS = options;
