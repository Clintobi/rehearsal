// Earn keeper: lists the stocks (once), records the last Pyth price before each 16:00
// close, and settles series 15 minutes later. Anyone can run it; every step is permissionless
// except listing, which needs the program's upgrade authority.
//
// On the practice fork (--fork) it also copies the live mainnet Pyth accounts onto the fork
// every cycle, so series settle on the real close. With --mm it runs a practice buyer that
// takes any ask within 10% of a Black-Scholes estimate. Fork only; it's there so the flow can be
// tried end to end, not to suggest there's real demand.
//
//   RPC=http://127.0.0.1:8899 MAINNET_RPC=<helius> npx tsx scripts/earn-keeper.ts --fork --mm
import { ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { readFileSync } from "fs";
import { TOKEN_PROGRAM } from "../src/lib/guard";
import { decodePriceUpdate, feedAccount } from "../src/lib/pyth";
import { CALL, PUT, buyIx, createMarketIx, finalizeIx, marketPda, snapshotIx, type SeriesKey } from "../src/lib/earn";
import { EARN_STOCKS, USDC, bs, earnBoard } from "../src/lib/earn-server";

const RPC = process.env.RPC ?? "http://127.0.0.1:8899";
const FORK = process.argv.includes("--fork");
const MM = process.argv.includes("--mm") && FORK;
const conn = new Connection(RPC, "confirmed");
const mainnet = process.env.MAINNET_RPC ? new Connection(process.env.MAINNET_RPC, "confirmed") : null;
const keeper = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.KEEPER_KEY ?? "onchain/keys/deployer.json", "utf8"))));
const mm = Keypair.generate();
const PROGRAMS = { stock: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"), stable: TOKEN_PROGRAM };
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const forkRpc = async (method: string, params: unknown[]) => {
  const j = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
};

async function send(ixs: TransactionInstruction[], signer: Keypair) {
  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: signer.publicKey, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...ixs] }).compileToV0Message());
  tx.sign([signer]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  for (let i = 0; i < 40; i++) {
    const s = (await conn.getSignatureStatuses([sig])).value[0];
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return !s.err;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function setup() {
  for (const s of EARN_STOCKS) {
    if (await conn.getAccountInfo(marketPda(s.mint))) continue;
    log(`listing ${s.symbol}:`, (await send([createMarketIx(keeper.publicKey, s.mint, s.feed)], keeper)) ? "ok" : "failed");
  }
}

async function refreshPrices() {
  if (!FORK || !mainnet) return;
  for (const s of EARN_STOCKS) {
    const acct = feedAccount(s.feed, 1);
    const [live, onFork] = await Promise.all([mainnet.getAccountInfo(acct), conn.getAccountInfo(acct)]);
    if (!live) continue;
    const newer = !onFork || decodePriceUpdate(live.data as Buffer, "").publishTime > decodePriceUpdate(onFork.data as Buffer, "").publishTime;
    if (newer) await forkRpc("surfnet_setAccount", [acct.toBase58(), { lamports: live.lamports, data: (live.data as Buffer).toString("hex"), owner: live.owner.toBase58(), executable: false }]);
  }
}

async function settle() {
  const board = await earnBoard(conn);
  for (const s of board.series) {
    if (s.settled) continue;
    const stock = EARN_STOCKS.find((x) => x.symbol === s.symbol)!;
    const k: SeriesKey = { stockMint: stock.mint, stableMint: USDC, kind: s.kind === "call" ? CALL : PUT, strikeE6: BigInt(s.strikeE6), expiry: s.expiry };
    const priceAcct = feedAccount(stock.feed, 1);
    if (board.now >= s.expiry - 300) {
      const pa = await conn.getAccountInfo(priceAcct);
      const p = pa ? decodePriceUpdate(pa.data as Buffer, "") : null;
      if (p && p.publishTime <= s.expiry && p.publishTime > s.snapPublish) log(`snapshot ${s.symbol} ${s.kind} ${s.shareStrike}:`, (await send([snapshotIx(k, priceAcct)], keeper)) ? "ok" : "failed");
    }
    if (board.now >= s.expiry + 15 * 60) log(`finalize ${s.symbol} ${s.kind} ${s.shareStrike}:`, (await send([finalizeIx(k)], keeper)) ? "settled" : "not yet");
  }
}

async function practiceBuyer() {
  if (!MM) return;
  const board = await earnBoard(conn);
  const years = Math.max(board.expiry - board.now, 3600) / (365 * 86400);
  for (const s of board.series) {
    if (s.settled || s.expiry !== board.expiry || !s.asks.length) continue;
    const st = board.stocks.find((x) => x.symbol === s.symbol)!;
    const fair = bs(s.kind === "call" ? CALL : PUT, st.share, s.shareStrike, st.vol, years);
    const cheap = s.asks.filter((a) => Number(a.askE6) / 1e6 / st.multiplier <= fair * 1.1 && a.owner !== mm.publicKey.toBase58());
    if (!cheap.length) continue;
    const stock = EARN_STOCKS.find((x) => x.symbol === s.symbol)!;
    const k: SeriesKey = { stockMint: stock.mint, stableMint: USDC, kind: s.kind === "call" ? CALL : PUT, strikeE6: BigInt(s.strikeE6), expiry: s.expiry };
    const total = cheap.reduce((n, a) => n + BigInt(a.available), 0n);
    const max = cheap.reduce((m, a) => (BigInt(a.askE6) > m ? BigInt(a.askE6) : m), 0n);
    const ok = await send([buyIx(mm.publicKey, k, PROGRAMS, cheap.slice(0, 6).map((a) => new PublicKey(a.owner)), total, max)], mm);
    log(`practice buyer took ${s.symbol} ${s.kind} ${s.shareStrike} (fair ≈ $${fair.toFixed(2)}/share):`, ok ? "bought" : "failed");
  }
}

(async () => {
  if (FORK) {
    await conn.requestAirdrop(keeper.publicKey, 5 * LAMPORTS_PER_SOL).catch(() => {});
    if (MM) {
      await conn.requestAirdrop(mm.publicKey, 5 * LAMPORTS_PER_SOL);
      await forkRpc("surfnet_setTokenAccount", [mm.publicKey.toBase58(), USDC.toBase58(), { amount: 1_000_000 * 1e6 }, TOKEN_PROGRAM.toBase58()]);
      log(`practice buyer ${mm.publicKey.toBase58()} funded with 1,000,000 fork USDC`);
    }
  }
  await setup();
  for (;;) {
    for (const step of [refreshPrices, settle, practiceBuyer]) {
      try { await step(); } catch (e) { log(step.name, "error:", e instanceof Error ? e.message : e); }
    }
    await new Promise((r) => setTimeout(r, 20_000));
  }
})();
