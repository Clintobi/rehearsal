import { NextRequest, NextResponse } from "next/server";
import { rpc } from "@/lib/rehearse";

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
    if (res.value.err) return NextResponse.json({ signature: sig, error: `Transaction failed: ${JSON.stringify(res.value.err)}` }, { status: 502 });
    return NextResponse.json({ signature: sig });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
