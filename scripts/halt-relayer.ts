// Mirrors primary-exchange trading halts onto the guard's circuit breakers.
// Source: Nasdaq Trader's official halt feed (covers every US-listed stock, all venues).
// The SEC's Sept 2026 exemption requires on-chain stock venues to halt when the underlying
// stock halts; this relayer is how the chain learns about it.
//
//   GUARD_RPC=<cluster rpc> npx tsx scripts/halt-relayer.ts            run forever
//   GUARD_RPC=<cluster rpc> npx tsx scripts/halt-relayer.ts --init     create the breakers first
import { ComputeBudgetProgram, Connection, Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import xstocks from "../src/data/xstocks.json";
import { breakerPda, decodeBreaker, initBreakerIx, setHaltIx } from "../src/lib/guard";

const conn = new Connection(process.env.GUARD_RPC ?? "https://api.devnet.solana.com", "confirmed");
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.HALT_AUTHORITY ?? "onchain/keys/deployer.json", "utf8"))));

// Tier 1 (S&P 500 / Nasdaq-100 names and the big ETFs) get a 5% band, like LULD.
const stocks = (xstocks as { symbol: string; ticker: string; equity: { id: string; account?: string; shard?: number } | null }[])
  .filter((x) => x.equity?.account && x.equity.shard === 1)
  .map((x) => ({ symbol: x.symbol, ticker: x.ticker, feed: x.equity!.id, band: 500 }));

export type Halt = { ticker: string; reason: string; haltedAt: string; resumed: boolean };

export async function nasdaqHalts(): Promise<Halt[]> {
  const xml = await (await fetch("https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts", { headers: { "user-agent": "rehearsal-halt-relayer" } })).text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const tag = (n: string) => it.match(new RegExp(`<ndaq:${n}>([^<]*)</ndaq:${n}>`))?.[1]?.trim() ?? "";
    return { ticker: tag("IssueSymbol"), reason: tag("ReasonCode"), haltedAt: `${tag("HaltDate")} ${tag("HaltTime")}`, resumed: !!tag("ResumptionTradeTime") };
  });
}

async function send(ixs: TransactionInstruction[]) {
  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: authority.publicKey, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }), ...ixs] }).compileToV0Message());
  tx.sign([authority]);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

async function init() {
  for (const s of stocks) {
    if (await conn.getAccountInfo(breakerPda(s.feed))) { console.log(s.symbol, "breaker exists"); continue; }
    console.log(s.symbol, "init", await send([initBreakerIx(authority.publicKey, s.feed, s.band)]));
  }
}

async function tick() {
  const halts = await nasdaqHalts();
  const status: Record<string, { halted: boolean; reason: string; since: string; onchain: boolean }> = {};
  for (const s of stocks) {
    // A ticker is halted if its latest item in the feed has no resumption yet.
    const h = halts.find((x) => x.ticker === s.ticker);
    const halted = !!h && !h.resumed;
    const acc = await conn.getAccountInfo(breakerPda(s.feed));
    if (!acc) continue;
    const b = decodeBreaker(acc.data as Buffer);
    if (b.exchangeHalted !== halted) {
      const sig = await send([setHaltIx(authority.publicKey, s.feed, halted, h?.reason ?? "")]);
      console.log(`${new Date().toISOString()} ${s.ticker} ${halted ? `HALTED (${h!.reason})` : "resumed"} → on-chain ${sig}`);
    }
    status[s.ticker] = { halted, reason: h?.reason ?? "", since: h?.haltedAt ?? "", onchain: true };
  }
  mkdirSync("data", { recursive: true });
  writeFileSync("data/halts.json", JSON.stringify({ at: Math.floor(Date.now() / 1000), feed_items: halts.length, status }));
}

(async () => {
  console.log(`halt relayer: ${stocks.length} breakers, authority ${authority.publicKey.toBase58()}`);
  if (process.argv.includes("--init")) { await init(); return; }
  for (;;) {
    try { await tick(); } catch (e) { console.error("tick", String(e).slice(0, 160)); }
    await new Promise((r) => setTimeout(r, 30_000));
  }
})();
