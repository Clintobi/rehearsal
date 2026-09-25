import { NextRequest } from "next/server";
import { marketOverview } from "@/lib/agent";
import { json, options } from "@/lib/api";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const r = await marketOverview(req.nextUrl.searchParams.get("symbol") ?? undefined);
  return json(r, "error" in r ? 400 : 200, { "Cache-Control": "no-store" });
}
export const OPTIONS = options;
