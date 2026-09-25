import { NextRequest } from "next/server";
import { executionReport } from "@/lib/agent";
import { json, options } from "@/lib/api";

export async function GET(req: NextRequest) {
  return json(await executionReport(req.nextUrl.searchParams.get("symbol") ?? undefined), 200, { "Cache-Control": "public, max-age=120" });
}
export const OPTIONS = options;
