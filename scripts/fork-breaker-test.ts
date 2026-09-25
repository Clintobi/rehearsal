// Circuit breaker + halt-sync, end to end on a Surfpool mainnet fork with the real NVDA
// Pyth account, the real NVDAx mint and real Jupiter routes. The price shock is simulated
// by rewriting the Pyth account on the fork; time is advanced with surfnet_timeTravel.
import { forkConnection } from "./fork-conn";
import { ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { readFileSync } from "fs";
import { breakerPda, buildGuardedSwap, checkBreakerIx, crankBreakerIx, decodeBreaker, GUARD_ERRORS, initBreakerIx, setHaltIx, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, type GuardLegs, type Policy } from "../src/lib/guard";
import { feedAccount } from "../src/lib/pyth";

const FORK = process.env.FORK_RPC ?? "http://127.0.0.1:8899";
const conn = forkConnection(FORK);
const mainnet = new Connection(process.env.MAINNET_RPC!, "confirmed");
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("onchain/keys/deployer.json", "utf8"))));
const user = Keypair.generate();
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

// Write the NVDA Pyth account on the fork: live mainnet data, optionally shocked, stamped with fork time.
async function setPrice(mult = 1) {
  const a = (await mainnet.getAccountInfo(PRICE))!;
  const d = Buffer.from(a.data);
  let o = 40; o += d[o] === 0 ? 2 : 1; o += 32;
  const price = d.readBigInt64LE(o);
  d.writeBigInt64LE(BigInt(Math.round(Number(price) * mult)), o);
  const t = BigInt(await forkNow());
  d.writeBigInt64LE(t, o + 20); d.writeBigInt64LE(t, o + 28);
  await rpc("surfnet_setAccount", [PRICE.toBase58(), { lamports: a.lamports, data: d.toString("hex"), owner: a.owner.toBase58(), executable: false }]);
}
const travel = async (secs: number) => { await rpc("surfnet_timeTravel", [{ absoluteTimestamp: ((await forkNow()) + secs) * 1000 }]); };

async function send(ixs: TransactionInstruction[], signers: Keypair[]) {
  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: signers[0].publicKey, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...ixs] }).compileToV0Message());
  tx.sign(signers);
  return sendTx(tx);
}
async function sendTx(tx: VersionedTransaction) {
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed").catch(() => {});
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  const code = Number(JSON.stringify(t?.meta?.err ?? "").match(/"Custom":(\d+)/)?.[1] ?? -1);
  const failed = t?.meta?.logMessages?.find((l) => l.includes(" failed: ")) ?? "";
  return { ok: !t?.meta?.err, code, failed };
}
async function breaker() { return decodeBreaker((await conn.getAccountInfo(breakerPda(FEED)))!.data as Buffer); }

async function guardedBuy(withCrank = true) {
  const q = await (await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${USDC}&outputMint=${NVDAX}&amount=100000000&slippageBps=300&dexes=${encodeURIComponent("Whirlpool,Raydium CLMM")}`)).json();
  const ixs = await (await fetch("https://lite-api.jup.ag/swap/v1/swap-instructions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteResponse: q, userPublicKey: user.publicKey.toBase58(), dynamicComputeUnitLimit: false }) })).json();
  const legs: GuardLegs = { user: user.publicKey, inputMint: USDC, inputTokenProgram: TOKEN_PROGRAM, outputMint: NVDAX, outputTokenProgram: TOKEN_2022_PROGRAM, priceUpdate: PRICE, breaker: breakerPda(FEED) };
  // Tolerance is wide so these tests isolate the breaker, not the fair-price check.
  const policy: Policy = { side: "buy", reference: { kind: "pyth", feedId: FEED, maxAgeSecs: 600, maxConfBps: 200 }, toleranceBps: 5000 };
  const { tx } = await buildGuardedSwap(conn, ixs, legs, policy, withCrank ? [crankBreakerIx(FEED, PRICE)] : []);
  tx.sign([user]);
  return sendTx(tx);
}

function record(name: string, r: { ok: boolean; code: number; failed: string }, expect: "pass" | number, extra = "") {
  const pass = expect === "pass" ? r.ok : r.code === expect && r.failed.includes("TSjcyX");
  results.push({ name, pass, detail: `${r.ok ? "filled" : GUARD_ERRORS[r.code] ?? r.failed} ${extra}` });
}

(async () => {
  await conn.confirmTransaction(await conn.requestAirdrop(user.publicKey, 5 * LAMPORTS_PER_SOL));
  await conn.confirmTransaction(await conn.requestAirdrop(authority.publicKey, 5 * LAMPORTS_PER_SOL));
  await rpc("surfnet_setTokenAccount", [user.publicKey.toBase58(), USDC.toBase58(), { amount: 2_000_000_000 }, TOKEN_PROGRAM.toBase58()]);
  await setPrice();

  let r = await send([initBreakerIx(authority.publicKey, FEED, 500), crankBreakerIx(FEED, PRICE)], [authority]);
  let b = await breaker();
  results.push({ name: "1. init NVDA breaker (5% band) and crank", pass: r.ok && b.state === "normal", detail: `state=${b.state} ref=$${(Number(b.referenceE6) / 1e6).toFixed(2)}` });

  record("2. guarded NVDAx buy with breaker in Normal: fills", await guardedBuy(), "pass");

  await setPrice(1.08);
  r = await send([crankBreakerIx(FEED, PRICE)], [authority]); b = await breaker();
  results.push({ name: "3. NVDA +8% shock → breaker enters Limit", pass: b.state === "limit", detail: `state=${b.state}` });
  record("4. guarded buy during Limit: reverts", await guardedBuy(), 6016);

  await travel(20); await setPrice(1.08);
  await send([crankBreakerIx(FEED, PRICE)], [authority]); b = await breaker();
  results.push({ name: "5. still outside band after 15s → Paused for 5 min", pass: b.state === "paused" && b.trips === 1, detail: `state=${b.state} trips=${b.trips} paused_until=+${b.pausedUntil - (await forkNow())}s` });
  record("6. guarded buy during Pause: reverts", await guardedBuy(), 6016);
  r = await send([checkBreakerIx(FEED)], [authority]);
  record("7. check_breaker (for any venue's CPI) during Pause: fails", r, 6016);

  await travel(305); await setPrice(1.08);
  await send([crankBreakerIx(FEED, PRICE)], [authority]); b = await breaker();
  results.push({ name: "8. pause ends → reopens against the new price", pass: b.state === "normal" && Math.abs(Number(b.referenceE6) - Number(b.lastPriceE6)) < 1_000_000, detail: `state=${b.state} ref=$${(Number(b.referenceE6) / 1e6).toFixed(2)}` });

  await setPrice(1.08);
  r = await send([setHaltIx(authority.publicKey, FEED, true, "T1")], [authority]); b = await breaker();
  results.push({ name: "9. Nasdaq halt posted (reason T1)", pass: r.ok && b.exchangeHalted && b.haltReason === "T1", detail: `halted=${b.exchangeHalted} reason=${b.haltReason}` });
  record("10. guarded buy while the exchange is halted: reverts", await guardedBuy(), 6017);
  const stranger = Keypair.generate();
  await conn.confirmTransaction(await conn.requestAirdrop(stranger.publicKey, LAMPORTS_PER_SOL));
  r = await send([setHaltIx(stranger.publicKey, FEED, false)], [stranger]);
  results.push({ name: "11. a stranger cannot lift the halt", pass: !r.ok, detail: r.failed.replace(/^Program /, "").slice(0, 80) });
  await send([setHaltIx(authority.publicKey, FEED, false)], [authority]);
  record("12. halt lifted → guarded buy fills", await guardedBuy(), "pass");

  await travel(90);
  record("13. breaker not cranked for 90s and no crank in the tx: reverts as stale", await guardedBuy(false), 6018);

  console.log("\n" + results.map((x) => `${x.pass ? "PASS" : "FAIL"}  ${x.name}\n      ${x.detail}`).join("\n"));
  console.log(`\n${results.filter((x) => x.pass).length}/${results.length} passed`);
  process.exit(results.every((x) => x.pass) ? 0 : 1);
})();
