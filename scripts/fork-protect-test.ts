// Protected swaps on a Surfpool mainnet fork: real Jupiter routes, real xStocks and PreStocks
// mints. The swap's minimum output is set from fair value (Pyth in the US session, the Lighter
// perp outside it, the PreStocks mark for pre-IPO) and Jupiter's program enforces it on-chain.
// Usage: FORK_RPC=http://127.0.0.1:8899 SOLANA_RPC=<mainnet> npx tsx scripts/fork-protect-test.ts
process.env.JUP_DEXES ??= "Whirlpool,Raydium CLMM";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { forkConnection } from "./fork-conn";
import { assembleSwap, buildProtectedSwap, certificate, floorQuote } from "../src/lib/agent";
import { quote, swapInstructions, USDC } from "../src/lib/jup";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "../src/lib/guard";

const FORK = process.env.FORK_RPC ?? "http://127.0.0.1:8899";
const conn = forkConnection(FORK);
const NVDAX = new PublicKey("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
const JUP_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const results: { name: string; pass: boolean; detail: string }[] = [];
const record = (name: string, pass: boolean, detail: string) => { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`); };

const rpcCall = async (method: string, params: unknown[]) => {
  const j = await (await fetch(FORK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
};

async function send(b64: string, kp: Keypair) {
  const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
  tx.message.recentBlockhash = (await conn.getLatestBlockhash()).blockhash; // fork blockhash
  tx.sign([kp]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed").catch(() => {});
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  const custom = JSON.stringify(t?.meta?.err ?? "").match(/"Custom":(\d+)/)?.[1];
  const failedProgram = t?.meta?.logMessages?.find((l) => l.includes(" failed: "))?.split(" ")[1] ?? "";
  return { sig, ok: !!t && !t.meta?.err, code: custom ? Number(custom) : null, failedProgram, logs: t?.meta?.logMessages ?? [] };
}

(async () => {
  const user = Keypair.generate();
  await conn.confirmTransaction(await conn.requestAirdrop(user.publicKey, 5 * LAMPORTS_PER_SOL));
  await rpcCall("surfnet_setTokenAccount", [user.publicKey.toBase58(), USDC, { amount: 5_000_000_000 }, TOKEN_PROGRAM.toBase58()]);
  const wallet = user.publicKey.toBase58();

  // 1. Protected NVDAx buy at the default limit fills, and the receipt memo verifies against the chain.
  const b1 = await buildProtectedSwap({ symbol: "NVDAx", usd: 300, side: "buy", wallet, conn });
  if ("error" in b1) { record("1. protected NVDAx buy ($300) fills", false, b1.error); }
  else {
    const s = await send(b1.transaction, user);
    const c = s.ok ? await certificate(s.sig, conn).catch((e) => ({ error: String(e) })) : null;
    const verified = !!c && !("error" in c) && c.verified;
    record("1. protected NVDAx buy ($300) fills", s.ok && verified,
      `fair $${b1.receipt.fairPrice} (${b1.receipt.fairSource}), limit ${b1.receipt.maxGapBps} bps, floor ${b1.receipt.minimumReceived.ui} NVDAx; ` +
      (c && !("error" in c) ? `received ${c.result.shares} NVDAx at $${c.result.fillPrice} (${c.result.gapPct}% vs fair), certificate verified=${c.verified}` : `send ok=${s.ok} ${c && "error" in c ? c.error : ""}`));
  }

  // 2. The floor is enforced by Jupiter's program: ask for 1% more than the route can deliver.
  {
    const q = await quote(USDC, NVDAX.toBase58(), 200_000_000n, 50);
    if ("error" in q) record("2. floor above what the route can deliver reverts on-chain", false, q.error);
    else {
      const tooHigh = (BigInt(q.outAmount) * 101n) / 100n;
      const jup = await swapInstructions(floorQuote(q, tooHigh), wallet);
      const { tx } = await assembleSwap(conn, jup, user.publicKey);
      const s = await send(Buffer.from(tx.serialize()).toString("base64"), user);
      record("2. floor above what the route can deliver reverts on-chain", !s.ok && s.failedProgram === JUP_PROGRAM,
        `ok=${s.ok}, failed in ${s.failedProgram || "?"} with custom error ${s.code} (Jupiter SlippageToleranceExceeded is 6001)`);
    }
  }

  // 3. Protected sell of part of the position.
  const b3 = await buildProtectedSwap({ symbol: "NVDAx", usd: 100, side: "sell", wallet, conn });
  if ("error" in b3) record("3. protected NVDAx sell ($100) fills", false, b3.error);
  else {
    const s = await send(b3.transaction, user);
    const c = s.ok ? await certificate(s.sig, conn).catch((e) => ({ error: String(e) })) : null;
    record("3. protected NVDAx sell ($100) fills", s.ok && !!c && !("error" in c) && c.verified,
      c && !("error" in c) ? `floor $${b3.receipt.minimumReceived.ui.toFixed(2)} USDC, received $${c.result.usd} at $${c.result.fillPrice}, verified=${c.verified}` : `ok=${s.ok} code=${s.code}`);
  }

  // 4. PreStocks: 1% transfer fee is withheld from the pool-to-buyer transfer; the floor accounts for it.
  process.env.JUP_DEXES = process.env.PRESTOCK_DEXES ?? "";
  if (!process.env.JUP_DEXES) delete process.env.JUP_DEXES;
  const b4 = await buildProtectedSwap({ symbol: "ANDURIL", usd: 60, side: "buy", wallet, conn });
  if ("error" in b4) record("4. protected PreStocks buy (ANDURIL, $60) fills after the 1% fee", false, b4.error);
  else {
    const s = await send(b4.transaction, user);
    const c = s.ok ? await certificate(s.sig, conn).catch((e) => ({ error: String(e) })) : null;
    record("4. protected PreStocks buy (ANDURIL, $60) fills after the 1% fee", s.ok && !!c && !("error" in c) && c.verified,
      c && !("error" in c) ? `mark $${b4.receipt.fairPrice.toFixed(2)}, limit ${b4.receipt.maxGapBps} bps, floor ${b4.receipt.minimumReceived.ui.toFixed(6)}, received ${c.result.shares} (${c.result.gapPct}% vs mark), verified=${c.verified}` : `ok=${s.ok} code=${s.code} ${s.failedProgram} ${s.logs.slice(-3).join(" | ")}`);
  }

  // 5. Refusal before signing: OPENAI trades ~30% over its mark, so a 1% limit builds nothing.
  const b5 = await buildProtectedSwap({ symbol: "OPENAI", usd: 100, side: "buy", wallet, maxGapBps: 100, conn });
  record("5. a limit tighter than the market is refused before anything is signed", "error" in b5 && /Refused/.test(b5.error), "error" in b5 ? b5.error : "built a swap (unexpected)");

  void TOKEN_2022_PROGRAM;
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
