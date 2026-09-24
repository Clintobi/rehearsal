import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { allAssets } from "@/lib/assets";
import { buildGuardedSwap, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, type Policy } from "@/lib/guard";
import { USDC } from "@/lib/jup";

const JUP = process.env.JUP_API ?? "https://lite-api.jup.ag/swap/v1";

// Builds [open_guard → Jupiter swap → close_guard] for the wallet to sign.
// The cluster is wherever the guard program is deployed (GUARD_RPC); mainnet by default.
export async function POST(req: NextRequest) {
  const { quote, userPublicKey, toleranceBps } = await req.json();
  if (!quote?.outAmount || typeof userPublicKey !== "string") return NextResponse.json({ error: "Missing quote or wallet" }, { status: 400 });
  const tol = Math.max(0, Math.min(5000, Math.round(Number(toleranceBps ?? 100))));
  const side: "buy" | "sell" = quote.inputMint === USDC ? "buy" : "sell";
  const stockMint = side === "buy" ? quote.outputMint : quote.inputMint;
  const asset = (await allAssets()).find((a) => a.mint === stockMint);
  if (!asset) return NextResponse.json({ error: "Guard supports xStocks and PreStocks against USDC" }, { status: 400 });

  let policy: Policy;
  let priceUpdate: PublicKey | undefined;
  if (asset.pyth) {
    policy = { side, reference: { kind: "pyth", feedId: asset.pyth.feed, maxAgeSecs: 600, maxConfBps: 200 }, toleranceBps: tol };
    priceUpdate = new PublicKey(asset.pyth.account);
  } else if (asset.mark) {
    policy = { side, reference: { kind: "limit", priceE6: BigInt(Math.round(asset.mark.price * 1e6)) }, toleranceBps: tol };
  } else {
    return NextResponse.json({ error: "No fair-value reference for this token" }, { status: 400 });
  }

  const ixs = await (await fetch(`${JUP}/swap-instructions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey, dynamicComputeUnitLimit: false,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 2_000_000, priorityLevel: "high" } } }),
  })).json();
  if (ixs.error || !ixs.swapInstruction) return NextResponse.json({ error: ixs.error ?? "Jupiter could not build the swap" }, { status: 502 });

  const conn = new Connection(process.env.GUARD_RPC ?? process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com", "confirmed");
  const user = new PublicKey(userPublicKey);
  const legs = {
    user,
    inputMint: new PublicKey(quote.inputMint), inputTokenProgram: side === "buy" ? TOKEN_PROGRAM : TOKEN_2022_PROGRAM,
    outputMint: new PublicKey(quote.outputMint), outputTokenProgram: side === "buy" ? TOKEN_2022_PROGRAM : TOKEN_PROGRAM,
    priceUpdate,
  };
  const { tx, lastValidBlockHeight } = await buildGuardedSwap(conn, ixs, legs, policy);
  return NextResponse.json({
    swapTransaction: Buffer.from(tx.serialize()).toString("base64"), lastValidBlockHeight,
    policy: { ...policy, reference: policy.reference.kind === "pyth" ? { kind: "pyth", feed: `Equity.US.${asset.pyth!.ticker}/USD` } : { kind: "limit", price: asset.mark!.price } },
  });
}
