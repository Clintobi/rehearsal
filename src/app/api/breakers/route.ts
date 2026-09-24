import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import xstocks from "@/data/xstocks.json";
import { breakerPda, decodeBreaker } from "@/lib/guard";

// Live halt status for every guarded stock: Nasdaq's official halt feed, next to the
// on-chain circuit breaker the relayer keeps in sync (devnet until the mainnet deploy).
const BREAKER_RPC = process.env.BREAKER_RPC ?? "https://api.devnet.solana.com";
const BREAKER_CLUSTER = process.env.BREAKER_CLUSTER ?? "devnet";
let cache: { at: number; body: unknown } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < 30_000) return NextResponse.json(cache.body);
  const stocks = (xstocks as { symbol: string; ticker: string; equity: { id: string; account?: string; shard?: number } | null }[])
    .filter((x) => x.equity?.account && x.equity.shard === 1);

  const xml = await (await fetch("https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts", { cache: "no-store" })).text().catch(() => "");
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const tag = (n: string) => it.match(new RegExp(`<ndaq:${n}>([^<]*)</ndaq:${n}>`))?.[1]?.trim() ?? "";
    return { ticker: tag("IssueSymbol"), reason: tag("ReasonCode"), at: `${tag("HaltDate")} ${tag("HaltTime")} ET`, resumed: !!tag("ResumptionTradeTime") };
  });

  const conn = new Connection(BREAKER_RPC, "confirmed");
  const accs = await conn.getMultipleAccountsInfo(stocks.map((s) => breakerPda(s.equity!.id))).catch(() => stocks.map(() => null));
  const rows = stocks.map((s, i) => {
    const h = items.find((x) => x.ticker === s.ticker);
    const b = accs[i] ? decodeBreaker(accs[i]!.data as Buffer) : null;
    return {
      symbol: s.symbol, ticker: s.ticker,
      nasdaq: { halted: !!h && !h.resumed, reason: h?.reason ?? null, at: h?.at ?? null, resumed: h?.resumed ?? null },
      breaker: b && { address: breakerPda(s.equity!.id).toBase58(), state: b.state, bandBps: b.bandBps, exchangeHalted: b.exchangeHalted, haltReason: b.haltReason, trips: b.trips },
    };
  });
  const body = { cluster: BREAKER_CLUSTER, feedItems: items.length, at: Date.now(), rows };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
