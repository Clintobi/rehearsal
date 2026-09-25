import { json, options } from "@/lib/api";

const q = (name: string, description: string, required = false, schema: Record<string, unknown> = { type: "string" }) => ({ name, in: "query", required, description, schema });
const get = (summary: string, parameters: unknown[] = []) => ({ get: { summary, parameters, responses: { 200: { description: "JSON" } } } });

const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Rehearsal API", version: "1.0.0",
    description: "Tradability passports and protected swaps for tokenized stocks on Solana. No key needed. The same functions are available as MCP tools at /api/mcp.",
  },
  servers: [{ url: "https://rehearsal-stocklana.vercel.app" }],
  paths: {
    "/api/v1/stocks": get("List covered tokenized stocks"),
    "/api/v1/passport": get("Tradability passport: structure, price evidence, exit capacity, fill vs fair, decision", [q("symbol", "NVDAx, SPYx, OPENAI, ticker or mint", true), q("usd", "Order size in USD", false, { type: "number", default: 1000 }), q("side", "buy or sell", false, { type: "string", enum: ["buy", "sell"] })]),
    "/api/v1/check": get("Fast price check and decision", [q("symbol", "Token", true), q("usd", "Order size in USD", true, { type: "number" }), q("side", "buy or sell")]),
    "/api/v1/swap": {
      post: {
        summary: "Build a protected swap (unsigned v0 transaction). Minimum output pinned to fair value ± maxGapBps; terms written to a memo.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["symbol", "usd", "wallet"], properties: { symbol: { type: "string" }, usd: { type: "number" }, side: { type: "string", enum: ["buy", "sell"] }, wallet: { type: "string" }, maxGapBps: { type: "number" }, simulate: { type: "boolean" } } } } } },
        responses: { 200: { description: "transaction (base64), lastValidBlockHeight, receipt" }, 422: { description: "Refused: halted, no trustworthy reference, or the market is already past your limit" } },
      },
    },
    "/api/v1/certificate": get("Verify a protected swap's receipt against the chain", [q("sig", "Transaction signature", true)]),
    "/api/v1/policy": get("Which price each trade is judged against, by market state"),
    "/api/v1/market": get("Sessions, halts, breakers, 24/7 perp prices, cross rules", [q("symbol", "Optional xStock symbol or ticker")]),
    "/api/v1/prestocks": get("PreStocks board: implied valuation, premium to mark, break-even listing value, float"),
    "/api/v1/report": get("Execution-quality report (bots excluded, ZK-proven)", [q("symbol", "Optional token")]),
  },
};

export async function GET() {
  return json(SPEC, 200, { "Cache-Control": "public, max-age=3600" });
}
export const OPTIONS = options;
