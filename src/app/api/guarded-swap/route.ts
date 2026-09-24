import { NextRequest, NextResponse } from "next/server";
import { guardedSwapTx } from "@/lib/guarded";

export async function POST(req: NextRequest) {
  const { quote, userPublicKey, toleranceBps } = await req.json();
  if (!quote?.outAmount || typeof userPublicKey !== "string") return NextResponse.json({ error: "Missing quote or wallet" }, { status: 400 });
  try {
    return NextResponse.json(await guardedSwapTx(quote, userPublicKey, Number(toleranceBps ?? 100)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
