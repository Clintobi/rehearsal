import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { buildSwap } from "@/lib/jup";
import { findAsset, fundsCheck } from "@/lib/agent";
import { rpc } from "@/lib/rehearse";

export async function POST(req: NextRequest) {
  const { quote, userPublicKey } = await req.json();
  if (!quote?.outAmount || typeof userPublicKey !== "string") return NextResponse.json({ error: "Missing quote or wallet" }, { status: 400 });
  let owner: PublicKey;
  try { owner = new PublicKey(userPublicKey); } catch { return NextResponse.json({ error: "Invalid wallet" }, { status: 400 }); }
  const stock = await findAsset(quote.inputMint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" ? quote.outputMint : quote.inputMint);
  const broke = await fundsCheck(rpc(), owner, quote, { symbol: stock?.symbol ?? "token", decimals: stock?.decimals ?? 0, multiplier: 1 });
  if (broke) return NextResponse.json({ error: broke }, { status: 422 });
  const r = await buildSwap(quote, userPublicKey);
  if (!r.swapTransaction) return NextResponse.json({ error: r.error ?? "Jupiter could not build the swap" }, { status: 502 });
  return NextResponse.json({ swapTransaction: r.swapTransaction, lastValidBlockHeight: r.lastValidBlockHeight });
}
