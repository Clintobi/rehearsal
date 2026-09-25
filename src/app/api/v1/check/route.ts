import { NextRequest } from "next/server";
import { checkTrade } from "@/lib/agent";
import { json, options } from "@/lib/api";

export const maxDuration = 30;

// GET /api/v1/check?symbol=NVDAx&usd=1000&side=buy
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = sp.get("symbol");
  if (!symbol) return json({ error: "symbol is required" }, 400);
  const r = await checkTrade({ symbol, usd: Number(sp.get("usd") ?? 1000), side: sp.get("side") === "sell" ? "sell" : "buy" });
  return json(r, "error" in r ? 400 : 200, { "Cache-Control": "no-store" });
}
export const OPTIONS = options;
