import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { buildEarnTx, type EarnAction } from "@/lib/earn-server";
import { rpc } from "@/lib/rehearse";

// Builds an unsigned Earn transaction (write, buy, unwrite, claim) for the wallet to sign.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as EarnAction & { wallet?: string };
  let wallet: PublicKey;
  try { wallet = new PublicKey(body.wallet ?? ""); } catch { return NextResponse.json({ error: "Connect a wallet first" }, { status: 400 }); }
  if (!["write", "buy", "unwrite", "claim"].includes(body.action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  try {
    return NextResponse.json(await buildEarnTx(rpc(), wallet, body));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}
