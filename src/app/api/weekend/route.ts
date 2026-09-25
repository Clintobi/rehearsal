import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { forecasts, lenderRisk } from "@/lib/weekend";

export const dynamic = "force-dynamic";

// Market data only, so it reads mainnet even when the app runs against the practice fork.
const conn = () => new Connection(process.env.MAINNET_RPC ?? process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com", "confirmed");

export async function GET() {
  try {
    const c = conn();
    const [f, lenders] = await Promise.all([forecasts(c), lenderRisk(c).catch(() => [])]);
    return NextResponse.json({ ...f, lenders }, { headers: { "cache-control": "public, s-maxage=60" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
