import { NextRequest } from "next/server";
import { certificate } from "@/lib/agent";
import { json, options } from "@/lib/api";

export const maxDuration = 30;

// GET /api/v1/certificate?sig=<transaction signature>
export async function GET(req: NextRequest) {
  const sig = req.nextUrl.searchParams.get("sig");
  if (!sig || sig.length < 60) return json({ error: "sig (a transaction signature) is required" }, 400);
  const r = await certificate(sig).catch((e) => ({ error: String(e).slice(0, 200) }));
  return json(r, "error" in r ? 404 : 200);
}
export const OPTIONS = options;
