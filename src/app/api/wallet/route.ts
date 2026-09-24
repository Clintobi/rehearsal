import { NextRequest, NextResponse } from "next/server";
import { walletHoldings } from "@/lib/wallet";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") ?? "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return NextResponse.json({ error: "That isn't a Solana address" }, { status: 400 });
  try {
    return NextResponse.json(await walletHoldings(address));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
