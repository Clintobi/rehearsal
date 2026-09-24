import { NextRequest, NextResponse } from "next/server";
import { compare } from "@/lib/compare";

export async function GET(req: NextRequest) {
  const c = req.nextUrl.searchParams.get("company") ?? "";
  const usd = Number(req.nextUrl.searchParams.get("usd") ?? "1000");
  if (!c || !(usd > 0) || usd > 1_000_000) return NextResponse.json({ error: "Pick a company and an amount" }, { status: 400 });
  const r = await compare(c, usd);
  return NextResponse.json(r, { status: "error" in r ? 404 : 200 });
}
