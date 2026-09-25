import { preBoard } from "@/lib/prestocks";
import { json, options } from "@/lib/api";

// GET /api/v1/prestocks: every PreStocks token, its implied valuation, premium to mark and float.
export async function GET() {
  try {
    return json({ issuer: "PreStocks", transferFeeBps: 100, rows: await preBoard(), at: Date.now() }, 200, { "Cache-Control": "public, max-age=60" });
  } catch {
    return json({ error: "PreStocks data is unavailable right now" }, 502);
  }
}
export const OPTIONS = options;
