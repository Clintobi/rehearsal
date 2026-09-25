import { NextRequest, NextResponse } from "next/server";
import { TOOLS } from "@/lib/tools";
import { CORS } from "@/lib/api";

// Model Context Protocol server over Streamable HTTP, stateless: every POST carries one JSON-RPC
// message (or a batch) and gets a JSON response. Connect with the URL alone.
export const maxDuration = 60;
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS = "Rehearsal checks tokenized-stock trades on Solana before they happen. Call passport (or check_trade) before any trade, follow decision.action, and execute with build_protected_swap so the chain enforces your limit. Verify fills with verify_receipt.";

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(m: Rpc) {
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return ok(m.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "rehearsal", title: "Rehearsal: tokenized stock passport", version: "1.0.0", websiteUrl: "https://rehearsal-stocklana.vercel.app/agents" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping": return ok(m.id, {});
    case "tools/list": return ok(m.id, { tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === m.params?.name);
      if (!tool) return err(m.id, -32602, `Unknown tool ${String(m.params?.name)}`);
      try {
        const out = await tool.run((m.params?.arguments as Record<string, unknown>) ?? {});
        const isError = !!out && typeof out === "object" && "error" in out;
        return ok(m.id, { content: [{ type: "text", text: JSON.stringify(out, null, 1) }], structuredContent: Array.isArray(out) ? { items: out } : out, isError });
      } catch (e) {
        return ok(m.id, { content: [{ type: "text", text: `Tool failed: ${e instanceof Error ? e.message : String(e)}` }], isError: true });
      }
    }
    default:
      return m.method.startsWith("notifications/") ? null : err(m.id, -32601, `Method not found: ${m.method}`);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json(err(null, -32700, "Parse error"), { status: 400, headers: CORS });
  const msgs: Rpc[] = Array.isArray(body) ? body : [body];
  const out = (await Promise.all(msgs.map(handle))).filter(Boolean);
  if (!out.length) return new NextResponse(null, { status: 202, headers: CORS });
  return NextResponse.json(Array.isArray(body) ? out : out[0], { headers: { ...CORS, "Cache-Control": "no-store" } });
}

// No server-initiated stream: the spec allows 405 here.
export async function GET() {
  return new NextResponse("Rehearsal MCP server. POST JSON-RPC to this URL (Streamable HTTP, stateless).", { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}
export const OPTIONS = () => new NextResponse(null, { status: 204, headers: CORS });
