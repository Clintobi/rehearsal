import { NextResponse } from "next/server";
import { allAssets } from "@/lib/assets";

export async function GET() {
  const assets = await allAssets();
  return NextResponse.json(assets.map((a) => ({
    symbol: a.symbol, name: a.name, mint: a.mint, kind: a.kind, icon: a.icon,
    ref: a.pyth ? `Pyth Equity.US.${a.pyth.ticker}` : a.mark ? "PreStocks mark" : null, company: a.company,
  })));
}
