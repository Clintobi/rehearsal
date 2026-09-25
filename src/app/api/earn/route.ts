import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { earnBoard } from "@/lib/earn-server";
import { rpc } from "@/lib/rehearse";

export const dynamic = "force-dynamic";

// This week's Earn series, the asks in each, prices, and (with ?wallet=) that wallet's positions.
export async function GET(req: NextRequest) {
  const w = req.nextUrl.searchParams.get("wallet");
  let wallet: PublicKey | undefined;
  if (w) {
    try { wallet = new PublicKey(w); } catch { return NextResponse.json({ error: "Invalid wallet" }, { status: 400 }); }
  }
  try {
    // A local RPC means the practice fork, not mainnet.
    const practice = /127\.0\.0\.1|localhost/.test(process.env.SOLANA_RPC ?? "");
    return NextResponse.json({ ...(await earnBoard(rpc(), wallet)), practice });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
