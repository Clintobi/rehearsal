// Fair orders, the opening cross and discovery bounds, end to end on a Surfpool mainnet fork
// with the real NVDA Pyth account and the real NVDAx / USDC mints. A closed market is
// simulated by advancing the fork clock with no Pyth update; the reopen by writing a fresh
// Pyth update with a Monday gap.
import { forkConnection } from "./fork-conn";
import { ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { createHash } from "crypto";
import {
  ata, buildGuardedSwap, cancelOrderIx, crankCrossIx, crossOrdersIx, crossPda, decodeCross, decodeOrder, fillOrderIx, GUARD_ERRORS,
  GUARD_PROGRAM_ID, orderPda, placeOrderIx, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, type GuardLegs, type OrderSpec, type Policy,
} from "../src/lib/guard";
import { feedAccount } from "../src/lib/pyth";

const FORK = process.env.FORK_RPC ?? "http://127.0.0.1:8899";
const conn = forkConnection(FORK);
const mainnet = new Connection(process.env.MAINNET_RPC!, "confirmed");
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const NVDAX = new PublicKey("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
const FEED = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";
const PRICE = feedAccount(FEED, 1);
const results: { name: string; pass: boolean; detail: string }[] = [];

const rpc = async (method: string, params: unknown[]) => {
  const j = await (await fetch(FORK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
};
const forkNow = async () => Number((await conn.getAccountInfo(new PublicKey("SysvarC1ock11111111111111111111111111111111")))!.data.readBigInt64LE(32));
const travel = async (secs: number) => { await rpc("surfnet_timeTravel", [{ absoluteTimestamp: ((await forkNow()) + secs) * 1000 }]); };

let livePrice = 0; // NVDA price, e6
let mult = 1;
// Pyth account on the fork: live mainnet bytes, price × `scale`, published `ageSecs` ago on the fork clock.
async function setPrice(scale = 1, ageSecs = 0) {
  const a = (await mainnet.getAccountInfo(PRICE))!;
  const d = Buffer.from(a.data);
  let o = 40; o += d[o] === 0 ? 2 : 1; o += 32;
  const p = d.readBigInt64LE(o);
  const expo = d.readInt32LE(o + 16);
  const scaled = BigInt(Math.round(Number(p) * scale));
  d.writeBigInt64LE(scaled, o);
  const t = BigInt((await forkNow()) - ageSecs);
  d.writeBigInt64LE(t, o + 20); d.writeBigInt64LE(t, o + 28);
  await rpc("surfnet_setAccount", [PRICE.toBase58(), { lamports: a.lamports, data: d.toString("hex"), owner: a.owner.toBase58(), executable: false }]);
  return Number(scaled) * 10 ** expo;
}
async function fund(kp: Keypair, usdc: number, nvdax: number) {
  await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, 3 * LAMPORTS_PER_SOL));
  await rpc("surfnet_setTokenAccount", [kp.publicKey.toBase58(), USDC.toBase58(), { amount: Math.round(usdc * 1e6) }, TOKEN_PROGRAM.toBase58()]);
  // NVDAx has 8 decimals; `nvdax` is in raw-token units (before the display multiplier)
  await rpc("surfnet_setTokenAccount", [kp.publicKey.toBase58(), NVDAX.toBase58(), { amount: Math.round(nvdax * 1e8) }, TOKEN_2022_PROGRAM.toBase58()]);
}
async function balance(owner: PublicKey, mint: PublicKey, prog: PublicKey) {
  const a = await conn.getAccountInfo(ata(owner, mint, prog));
  return a ? a.data.readBigUInt64LE(64) : 0n;
}
async function send(ixs: TransactionInstruction[], signers: Keypair[]) {
  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: signers[0].publicKey, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), ...ixs] }).compileToV0Message());
  tx.sign(signers);
  return sendTx(tx);
}
async function sendTx(tx: VersionedTransaction) {
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed").catch(() => {});
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  const code = Number(JSON.stringify(t?.meta?.err ?? "").match(/"Custom":(\d+)/)?.[1] ?? -1);
  const failed = t?.meta?.logMessages?.find((l) => l.includes(" failed: ")) ?? "";
  const ev = t?.meta?.logMessages?.filter((l) => l.startsWith("Program data: ")).map((l) => Buffer.from(l.slice(14), "base64")) ?? [];
  return { ok: !t?.meta?.err, code, failed, ev, logs: t?.meta?.logMessages ?? [] };
}
const evDisc = (n: string) => createHash("sha256").update(`event:${n}`).digest().subarray(0, 8);
function filledEvent(ev: Buffer[]) {
  const b = ev.find((x) => x.subarray(0, 8).equals(evDisc("OrderFilled")));
  if (!b) return null;
  const d = b.subarray(8 + 64 + 1);
  return { fill: Number(d.readBigUInt64LE(16)) / 1e6, ref: Number(d.readBigUInt64LE(24)) / 1e6, gap: d.readInt32LE(32) };
}
function record(name: string, r: { ok: boolean; code: number; failed: string }, expect: "pass" | number, detail = "") {
  const pass = expect === "pass" ? r.ok : r.code === expect && r.failed.includes(GUARD_PROGRAM_ID.toBase58());
  results.push({ name, pass, detail: `${r.ok ? "ok" : GUARD_ERRORS[r.code] ?? r.failed} ${detail}`.trim() });
}

const spec = (owner: PublicKey, nonce: bigint, side: "buy" | "sell", amountIn: bigint, maxGapBps: number, atOpen: boolean): OrderSpec => ({
  owner, nonce, feedIdHex: FEED, side, stockMint: NVDAX, stableMint: USDC, stockTokenProgram: TOKEN_2022_PROGRAM, stableTokenProgram: TOKEN_PROGRAM,
  amountIn, maxGapBps, atOpen, ttlSecs: 7 * 24 * 3600,
});
// NVDAx raw units the market maker must deliver so the displayed price is `priceUsd`.
const rawForUsd = (usd: number, priceUsd: number) => BigInt(Math.floor(((usd / priceUsd) / mult) * 1e8));

(async () => {
  const buyer = Keypair.generate(), seller = Keypair.generate(), mm = Keypair.generate(), weekendBuyer = Keypair.generate(), weekendSeller = Keypair.generate(), guardUser = Keypair.generate();
  await Promise.all([fund(buyer, 2000, 0), fund(seller, 0, 5), fund(mm, 5000, 50), fund(weekendBuyer, 1000, 0), fund(weekendSeller, 0, 10), fund(guardUser, 1000, 0)]);
  livePrice = await setPrice();
  // NVDAx scaled-UI multiplier, read the same way the program does
  const mint = (await conn.getAccountInfo(NVDAX))!.data;
  let o = 166;
  while (o + 4 <= mint.length) { const ty = mint.readUInt16LE(o), len = mint.readUInt16LE(o + 2); if (ty === 25) { const ts = Number(mint.readBigInt64LE(o + 4 + 40)); mult = (ts && Date.now() / 1000 >= ts) ? mint.readDoubleLE(o + 4 + 48) : mint.readDoubleLE(o + 4 + 32); break; } o += 4 + len; }
  console.log(`NVDA $${livePrice.toFixed(2)}, NVDAx multiplier ${mult}`);

  // ---- fair-value fills by a market maker
  const b1 = spec(buyer.publicKey, 1n, "buy", 500_000_000n, 50, false);
  record("1. buyer rests a $500 NVDAx order, max 0.5% over Pyth", await send([placeOrderIx(b1)], [buyer]), "pass");
  let r = await send([fillOrderIx(b1, mm.publicKey, 200_000_000n, rawForUsd(200, livePrice * 1.02), PRICE)], [mm]);
  record("2. market maker fills $200 at 2% over Pyth: rejected", r, 6000);
  await setPrice();
  r = await send([fillOrderIx(b1, mm.publicKey, 200_000_000n, rawForUsd(200, livePrice * 1.002), PRICE)], [mm]);
  let e = filledEvent(r.ev);
  record("3. market maker fills $200 at 0.2% over Pyth: accepted", r, "pass", e ? `fill $${e.fill.toFixed(2)} vs Pyth $${e.ref.toFixed(2)}, gap ${e.gap} bps` : "");
  r = await send([fillOrderIx(b1, mm.publicKey, 300_000_000n, rawForUsd(300, livePrice * 0.999), PRICE)], [mm]);
  e = filledEvent(r.ev);
  record("4. a better quote fills the rest below Pyth: price improvement goes to the buyer", r, "pass", e ? `fill $${e.fill.toFixed(2)} vs Pyth $${e.ref.toFixed(2)}, gap ${e.gap} bps` : "");
  const ob = decodeOrder((await conn.getAccountInfo(orderPda(buyer.publicKey, 1n)))!.data as Buffer);
  results.push({ name: "5. order fully filled; buyer holds the NVDAx", pass: ob.remainingIn === 0n && (await balance(buyer.publicKey, NVDAX, TOKEN_2022_PROGRAM)) === ob.receivedOut, detail: `remaining ${ob.remainingIn}, received ${Number(ob.receivedOut) / 1e8 * mult} NVDAx shown` });

  const s1 = spec(seller.publicKey, 1n, "sell", 100_000_000n, 50, false); // 1 raw NVDAx
  await send([placeOrderIx(s1)], [seller]);
  const sellUsd = (1 * mult) * livePrice * 0.998;
  r = await send([fillOrderIx(s1, mm.publicKey, 100_000_000n, BigInt(Math.floor(sellUsd * 1e6)), PRICE)], [mm]);
  e = filledEvent(r.ev);
  record("6. seller's order filled 0.2% under Pyth (inside a 0.5% limit)", r, "pass", e ? `fill $${e.fill.toFixed(2)} vs Pyth $${e.ref.toFixed(2)}, gap ${e.gap} bps` : "");

  // ---- weekend: orders wait for the opening cross
  const wb = spec(weekendBuyer.publicKey, 1n, "buy", 600_000_000n, 100, true);
  const ws = spec(weekendSeller.publicKey, 1n, "sell", 200_000_000n, 100, true); // 2 raw NVDAx
  await send([crankCrossIx(weekendBuyer.publicKey, FEED, PRICE)], [weekendBuyer]); // arm: last publish before the close
  record("7. Friday: buyer places an at-open order", await send([placeOrderIx(wb)], [weekendBuyer]), "pass");
  record("8. Friday: seller places an at-open order", await send([placeOrderIx(ws)], [weekendSeller]), "pass");
  record("9. at-open orders can't be picked off by a filler over the weekend", await send([fillOrderIx(wb, mm.publicKey, 100_000_000n, rawForUsd(100, livePrice), PRICE)], [mm]), 6021);

  await travel(3 * 3600); // market closed: no Pyth updates
  await send([crankCrossIx(weekendBuyer.publicKey, FEED, PRICE)], [weekendBuyer]);
  let c = decodeCross((await conn.getAccountInfo(crossPda(FEED)))!.data as Buffer);
  results.push({ name: "10. a crank during the closed market doesn't open a cross", pass: c.crosses === 0, detail: `crosses=${c.crosses}` });

  const monday = await setPrice(1.03); // reopen print, +3% gap
  await send([crankCrossIx(weekendBuyer.publicKey, FEED, PRICE)], [weekendBuyer]);
  c = decodeCross((await conn.getAccountInfo(crossPda(FEED)))!.data as Buffer);
  results.push({ name: "11. first Pyth print after 3h of silence opens the cross at that price", pass: c.crosses === 1 && Math.abs(Number(c.priceE6) / 1e6 - monday) < 0.01, detail: `cross price $${(Number(c.priceE6) / 1e6).toFixed(2)} (Friday $${livePrice.toFixed(2)}), window ${c.windowEnd - (await forkNow())}s` });

  const usdcBefore = await balance(weekendSeller.publicKey, USDC, TOKEN_PROGRAM);
  r = await send([crossOrdersIx(wb, ws)], [weekendBuyer]);
  const got = await balance(weekendBuyer.publicKey, NVDAX, TOKEN_2022_PROGRAM);
  const paid = (await balance(weekendSeller.publicKey, USDC, TOKEN_PROGRAM)) - usdcBefore;
  const impliedPrice = Number(paid) / 1e6 / ((Number(got) / 1e8) * mult);
  record("12. cross matches the two orders at the single cross price", r, "pass", `buyer got ${(Number(got) / 1e8 * mult).toFixed(4)} NVDAx, seller got $${(Number(paid) / 1e6).toFixed(2)}, implied $${impliedPrice.toFixed(2)}`);
  results.push({ name: "13. implied price equals the cross price (to the cent)", pass: Math.abs(impliedPrice - Number(c.priceE6) / 1e6) < 0.01, detail: `$${impliedPrice.toFixed(4)} vs $${(Number(c.priceE6) / 1e6).toFixed(4)}` });

  await travel(6 * 60);
  record("14. after the 5-minute window, crossing is closed", await send([crossOrdersIx(wb, ws)], [weekendBuyer]), 6023);

  const before = await balance(weekendBuyer.publicKey, USDC, TOKEN_PROGRAM);
  const left = decodeOrder((await conn.getAccountInfo(orderPda(weekendBuyer.publicKey, 1n)))!.data as Buffer).remainingIn;
  r = await send([cancelOrderIx(wb)], [weekendBuyer]);
  const back = (await balance(weekendBuyer.publicKey, USDC, TOKEN_PROGRAM)) - before;
  record("15. buyer cancels; unfilled USDC comes back", r, "pass", `returned $${(Number(back) / 1e6).toFixed(2)} of $${(Number(left) / 1e6).toFixed(2)} left`);

  // ---- discovery bounds on the guard
  const USDC_NVDA = async (drift: number) => {
    const q = await (await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${USDC}&outputMint=${NVDAX}&amount=100000000&slippageBps=300&dexes=${encodeURIComponent("Whirlpool,Raydium CLMM")}`)).json();
    const ixs = await (await fetch("https://lite-api.jup.ag/swap/v1/swap-instructions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteResponse: q, userPublicKey: guardUser.publicKey.toBase58(), dynamicComputeUnitLimit: false }) })).json();
    const legs: GuardLegs = { user: guardUser.publicKey, inputMint: USDC, inputTokenProgram: TOKEN_PROGRAM, outputMint: NVDAX, outputTokenProgram: TOKEN_2022_PROGRAM, priceUpdate: PRICE };
    const policy: Policy = { side: "buy", reference: { kind: "pyth", feedId: FEED, maxAgeSecs: 3 * 24 * 3600, maxConfBps: 200 }, toleranceBps: 100, driftBpsPerHour: drift };
    const { tx } = await buildGuardedSwap(conn, ixs, legs, policy);
    tx.sign([guardUser]);
    return sendTx(tx);
  };
  // Oracle 4h stale and 2% below where the pool trades: a buy looks ~2% over "fair".
  await setPrice(0.98, 4 * 3600);
  record("16. stale oracle, fixed 1% tolerance: the buy is blocked", await USDC_NVDA(0), 6000);
  record("17. same trade with discovery bounds (+50 bps/hour × 4h = 3%): allowed", await USDC_NVDA(50), "pass");

  console.log("\n" + results.map((x) => `${x.pass ? "PASS" : "FAIL"}  ${x.name}\n      ${x.detail}`).join("\n"));
  console.log(`\n${results.filter((x) => x.pass).length}/${results.length} passed`);
  process.exit(results.every((x) => x.pass) ? 0 : 1);
})();
