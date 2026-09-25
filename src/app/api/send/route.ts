import { NextRequest, NextResponse } from "next/server";
import { rpc } from "@/lib/rehearse";

// Plain words for the failures people actually hit.
function explain(msg: string) {
  if (/no record of a prior credit/i.test(msg)) return "This wallet has no SOL on Solana mainnet, so it can't pay the network fee. Add about 0.01 SOL and try again. Nothing was sent.";
  if (/insufficient lamports|insufficient funds for (fee|rent)/i.test(msg)) return "Not enough SOL for the network fee and token-account rent. Add about 0.01 SOL and try again. Nothing was sent.";
  if (/"Custom":1\b|insufficient funds/i.test(msg)) return "Not enough of the token you're paying with. Lower the amount and try again. Nothing was sent.";
  if (/blockhash not found|block height exceeded/i.test(msg)) return "The price quote expired before the transaction landed. Try again. Nothing was sent.";
  return msg;
}

// Relays a wallet-signed transaction through our RPC and waits for confirmation.
export async function POST(req: NextRequest) {
  const { signed, lastValidBlockHeight } = await req.json();
  if (typeof signed !== "string") return NextResponse.json({ error: "Missing signed transaction" }, { status: 400 });
  const conn = rpc();
  try {
    const raw = Buffer.from(signed, "base64");
    const sig = await conn.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 });
    const { blockhash } = await conn.getLatestBlockhash();
    const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (res.value.err) return NextResponse.json({ signature: sig, error: explain(`Transaction failed: ${JSON.stringify(res.value.err)}`) }, { status: 502 });
    return NextResponse.json({ signature: sig });
  } catch (e) {
    return NextResponse.json({ error: explain(e instanceof Error ? e.message : String(e)) }, { status: 502 });
  }
}
