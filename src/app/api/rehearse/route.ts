import { NextRequest, NextResponse } from "next/server";
import { allAssets } from "@/lib/assets";
import { rehearse } from "@/lib/rehearse";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mint = sp.get("mint");
  const usd = Number(sp.get("usd") ?? "0");
  const side = sp.get("side") === "sell" ? "sell" : "buy";
  if (!mint || !(usd > 0) || usd > 1_000_000) return NextResponse.json({ error: "Pick a token and a USD amount" }, { status: 400 });
  const asset = (await allAssets()).find((a) => a.mint === mint);
  if (!asset) return NextResponse.json({ error: "Unknown token" }, { status: 404 });
  const r = await rehearse(asset, usd, side);
  return NextResponse.json(r, { status: "error" in r ? 502 : 200 });
}
