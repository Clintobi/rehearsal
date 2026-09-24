// End-to-end test of the Rehearsal Guard on a Surfpool mainnet fork: real Jupiter routes,
// real Pyth price accounts, real xStock / PreStocks mints.
//   surfpool start -u <mainnet rpc> --no-tui --no-deploy --no-studio
//   solana program deploy ... -u localhost
//   npx tsx scripts/fork-test.ts
import { createHash } from "crypto";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from "@solana/web3.js";
import { buildGuardedSwap, closeGuardIx, openGuardIx, GUARD_ERRORS, GUARD_PROGRAM_ID, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, pda, type GuardLegs, type Policy } from "../src/lib/guard";
import { feedAccount } from "../src/lib/pyth";

const LOCAL = process.env.FORK_RPC ?? "http://127.0.0.1:8899";
const JUP = "https://lite-api.jup.ag/swap/v1";
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const NVDAX = new PublicKey("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
const OPENAI = new PublicKey("PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF");
const SPACEX = new PublicKey("PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh");
const NVDA_FEED = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";
const AAPL_FEED = "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688";

const conn = new Connection(LOCAL, "confirmed");
const user = Keypair.generate();
const results: { name: string; pass: boolean; detail: string }[] = [];

async function rpc(method: string, params: unknown[]) {
  const r = await fetch(LOCAL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

// Oracle-based prop AMMs reject stale prices on a fork, so fork tests can pin venues.
async function jupIxs(input: PublicKey, output: PublicKey, amount: bigint, dexes?: string) {
  const q = await (await fetch(`${JUP}/quote?inputMint=${input}&outputMint=${output}&amount=${amount}&slippageBps=300${dexes ? `&dexes=${encodeURIComponent(dexes)}` : ""}`)).json();
  if (!q.outAmount) throw new Error(`quote: ${JSON.stringify(q)}`);
  const ixs = await (await fetch(`${JUP}/swap-instructions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ quoteResponse: q, userPublicKey: user.publicKey.toBase58(), wrapAndUnwrapSol: false, dynamicComputeUnitLimit: false }),
  })).json();
  if (ixs.error) throw new Error(`swap-instructions: ${ixs.error}`);
  return { q, ixs };
}

function guardErr(logs: string[] | null | undefined, err: unknown) {
  const m = JSON.stringify(err ?? "").match(/"Custom":(\d+)/);
  // Only our program's failures map to guard errors; Jupiter's AMMs reuse the same numbers.
  const failed = logs?.find((l) => / failed: /.test(l)) ?? "";
  const ours = failed.startsWith(`Program ${GUARD_PROGRAM_ID.toBase58()} failed`);
  const code = m && ours ? Number(m[1]) : null;
  if (!ours && failed) return { code: null, text: `swap failed: ${failed}`, guardLine: "" };
  const guardLine = logs?.find((l) => l.includes("Guard:")) ?? "";
  return { code, text: code != null ? GUARD_ERRORS[code] ?? `custom ${code}` : JSON.stringify(err), guardLine };
}

async function send(tx: VersionedTransaction) {
  tx.sign([user]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed").catch(() => {});
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  return { sig, ok: !t?.meta?.err, err: t?.meta?.err, logs: t?.meta?.logMessages };
}

const EVENT_DISC = createHash("sha256").update("event:GuardedFill").digest().subarray(0, 8);
function eventFrom(logs: string[] | null | undefined) {
  const raw = logs?.filter((l) => l.startsWith("Program data: ")).map((l) => Buffer.from(l.slice(14), "base64")).find((b) => b.subarray(0, 8).equals(EVENT_DISC));
  if (!raw) return null;
  const d = raw.subarray(8);
  let o = 32 * 3;
  const side = d[o] === 0 ? "buy" : "sell"; o += 1;
  const spent = d.readBigUInt64LE(o); o += 8;
  const received = d.readBigUInt64LE(o); o += 8;
  const fill = Number(d.readBigUInt64LE(o)) / 1e6; o += 8;
  const ref = Number(d.readBigUInt64LE(o)) / 1e6; o += 8;
  const gap = d.readInt32LE(o); o += 4;
  const tol = d.readUInt16LE(o); o += 2;
  const mult = Number(d.readBigUInt64LE(o)) / 1e9; o += 8;
  const pyth = d[o] === 1;
  return { side, spent, received, fill, ref, gapBps: gap, tol, mult, pyth };
}

async function guarded(name: string, input: PublicKey, inProg: PublicKey, output: PublicKey, outProg: PublicKey, amount: bigint, policy: Policy, priceUpdate: PublicKey | undefined, expect: "pass" | number, dexes?: string) {
  try {
    const { ixs } = await jupIxs(input, output, amount, dexes);
    const legs: GuardLegs = { user: user.publicKey, inputMint: input, inputTokenProgram: inProg, outputMint: output, outputTokenProgram: outProg, priceUpdate };
    const { tx } = await buildGuardedSwap(conn, ixs, legs, policy);
    const r = await send(tx);
    if (r.ok) {
      const ev = eventFrom(r.logs);
      const detail = ev ? `fill $${ev.fill.toFixed(2)} vs ref $${ev.ref.toFixed(2)} gap ${ev.gapBps}bps (tol ${ev.tol}) mult ${ev.mult} pyth=${ev.pyth} · ${r.sig.slice(0, 12)}…` : "no event";
      results.push({ name, pass: expect === "pass", detail });
    } else {
      const e = guardErr(r.logs, r.err);
      results.push({ name, pass: expect === e.code, detail: `${e.text} ${e.guardLine.replace(/^Program log: /, "")}` });
      if (expect === "pass") console.log(r.logs?.slice(-15).join("\n"));
    }
  } catch (e) {
    results.push({ name, pass: false, detail: String(e).slice(0, 300) });
  }
}

async function main() {
  console.log("guard program", GUARD_PROGRAM_ID.toBase58(), "user", user.publicKey.toBase58());
  await conn.confirmTransaction(await conn.requestAirdrop(user.publicKey, 20 * LAMPORTS_PER_SOL));
  // Surfpool cheatcode: give the test wallet 20,000 USDC.
  await rpc("surfnet_setTokenAccount", [user.publicKey.toBase58(), USDC.toBase58(), { amount: 20_000_000_000 }, TOKEN_PROGRAM.toBase58()]);

  const pythNvda = feedAccount(NVDA_FEED, 1);
  const pythAapl = feedAccount(AAPL_FEED, 1);
  const pyth = (tol: number): Policy => ({ side: "buy", reference: { kind: "pyth", feedId: NVDA_FEED, maxAgeSecs: 600, maxConfBps: 200 }, toleranceBps: tol });

  await guarded("1. Buy $500 NVDAx, Pyth guard 1%: passes", USDC, TOKEN_PROGRAM, NVDAX, TOKEN_2022_PROGRAM, 500_000_000n, pyth(100), pythNvda, "pass");
  await guarded("2. Buy with a fair price 20% below Pyth: reverts", USDC, TOKEN_PROGRAM, NVDAX, TOKEN_2022_PROGRAM, 500_000_000n,
    { side: "buy", reference: { kind: "limit", priceE6: 180_000_000n }, toleranceBps: 100 }, undefined, 6000);
  await guarded("3. Spoofed oracle (AAPL account for NVDA feed): reverts", USDC, TOKEN_PROGRAM, NVDAX, TOKEN_2022_PROGRAM, 100_000_000n, pyth(100), pythAapl, 6007);
  await guarded("4. Fake oracle account (USDC mint as price): reverts", USDC, TOKEN_PROGRAM, NVDAX, TOKEN_2022_PROGRAM, 100_000_000n, pyth(100), USDC, 6006);
  await guarded("5. Sell 1 NVDAx back to USDC, Pyth guard 1%: passes", NVDAX, TOKEN_2022_PROGRAM, USDC, TOKEN_PROGRAM, 100_000_000n,
    { side: "sell", reference: { kind: "pyth", feedId: NVDA_FEED, maxAgeSecs: 600, maxConfBps: 200 }, toleranceBps: 100 }, pythNvda, "pass");
  await guarded("6. Buy $300 OPENAI PreStocks capped at mark +5%: reverts", USDC, TOKEN_PROGRAM, OPENAI, TOKEN_2022_PROGRAM, 300_000_000n,
    { side: "buy", reference: { kind: "limit", priceE6: 1_023_650_000n }, toleranceBps: 500 }, undefined, 6000);
  await guarded("7. Buy $300 SPACEX PreStocks capped at mark: passes (5x multiplier applied)", USDC, TOKEN_PROGRAM, SPACEX, TOKEN_2022_PROGRAM, 300_000_000n,
    { side: "buy", reference: { kind: "limit", priceE6: 147_450_000n }, toleranceBps: 0 }, undefined, "pass", "Meteora DLMM");

  // 8. open_guard with no close in the same transaction
  try {
    const legs: GuardLegs = { user: user.publicKey, inputMint: USDC, inputTokenProgram: TOKEN_PROGRAM, outputMint: NVDAX, outputTokenProgram: TOKEN_2022_PROGRAM };
    const { blockhash } = await conn.getLatestBlockhash();
    const msg = new TransactionMessage({ payerKey: user.publicKey, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }), openGuardIx(legs, pyth(100))] }).compileToV0Message();
    const r = await send(new VersionedTransaction(msg));
    const e = guardErr(r.logs, r.err);
    results.push({ name: "8. open_guard without close_guard: reverts", pass: e.code === 6001, detail: e.text });
  } catch (e) { results.push({ name: "8. open_guard without close_guard", pass: false, detail: String(e) }); }
  void closeGuardIx;

  // Ledger + stats accounts
  const ledger = await conn.getAccountInfo(pda("ledger", user.publicKey));
  const stats = await conn.getAccountInfo(pda("stats"));
  if (ledger) {
    const d = ledger.data.subarray(8 + 32);
    const fills = d.readBigUInt64LE(0);
    const vol = Number(d.readBigUInt64LE(8)) / 1e6;
    results.push({ name: "9. Ledger PDA records guarded fills", pass: fills === 3n, detail: `fills=${fills} volume=$${vol.toFixed(2)} stats=${stats ? "present" : "missing"}` });
  } else results.push({ name: "9. Ledger PDA records guarded fills", pass: false, detail: "no ledger" });

  console.log("\n" + results.map((r) => `${r.pass ? "PASS" : "FAIL"}  ${r.name}\n      ${r.detail}`).join("\n"));
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}

main();
