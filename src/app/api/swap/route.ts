import { NextRequest, NextResponse } from "next/server";
import { buildSwap } from "@/lib/jup";

export async function POST(req: NextRequest) {
  const { quote, userPublicKey } = await req.json();
  if (!quote?.outAmount || typeof userPublicKey !== "string") return NextResponse.json({ error: "Missing quote or wallet" }, { status: 400 });
  const r = await buildSwap(quote, userPublicKey);
  if (!r.swapTransaction) return NextResponse.json({ error: r.error ?? "Jupiter could not build the swap" }, { status: 502 });
  return NextResponse.json({ swapTransaction: r.swapTransaction, lastValidBlockHeight: r.lastValidBlockHeight });
}
