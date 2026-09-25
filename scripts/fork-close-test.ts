// The closing cross, end to end on a Surfpool mainnet fork with the real NVDA Pyth account
// and NVDAx / USDC mints. The fork clock is moved to 15:50 New York time today; a pre-close
// Pyth print sets the closing price, and an after-hours print must not change it.
import { forkConnection } from "./fork-conn";
import { ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { Connection } from "@solana/web3.js";
import {
  ata, cancelOrderIx, closePda, crankCloseIx, crossAtCloseIx, decodeClose, fillOrderIx, GUARD_ERRORS, GUARD_PROGRAM_ID,
  placeOrderIx, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, type OrderSpec,
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
  for (let i = 0; ; i++) {
    const j = await (await fetch(FORK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
    if (!j.error) return j.result;
    if (i >= 6 || !String(j.error.data ?? "").includes("Failed to fetch")) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
};
const forkNow = async () => Number((await conn.getAccountInfo(new PublicKey("SysvarC1ock11111111111111111111111111111111")))!.data.readBigInt64LE(32));
const travelTo = async (unix: number) => { await rpc("surfnet_timeTravel", [{ absoluteTimestamp: unix * 1000 }]); };

// Pyth account on the fork: live mainnet bytes, price × scale, published at `publishAt` (unix).
async function setPrice(scale: number, publishAt: number) {
  const a = (await mainnet.getAccountInfo(PRICE))!;
  const d = Buffer.from(a.data);
  let o = 40; o += d[o] === 0 ? 2 : 1; o += 32;
  const p = d.readBigInt64LE(o);
  const expo = d.readInt32LE(o + 16);
  const scaled = BigInt(Math.round(Number(p) * scale));
  d.writeBigInt64LE(scaled, o);
  d.writeBigInt64LE(BigInt(publishAt), o + 20); d.writeBigInt64LE(BigInt(publishAt), o + 28);
  await rpc("surfnet_setAccount", [PRICE.toBase58(), { lamports: a.lamports, data: d.toString("hex"), owner: a.owner.toBase58(), executable: false }]);
  return Number(scaled) * 10 ** expo;
}
async function fund(kp: Keypair, usdc: number, nvdax: number) {
  await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, 3 * LAMPORTS_PER_SOL));
  await rpc("surfnet_setTokenAccount", [kp.publicKey.toBase58(), USDC.toBase58(), { amount: Math.round(usdc * 1e6) }, TOKEN_PROGRAM.toBase58()]);
  await rpc("surfnet_setTokenAccount", [kp.publicKey.toBase58(), NVDAX.toBase58(), { amount: Math.round(nvdax * 1e8) }, TOKEN_2022_PROGRAM.toBase58()]);
}
const bal = async (owner: PublicKey, mint: PublicKey, prog: PublicKey) => { const a = await conn.getAccountInfo(ata(owner, mint, prog)); return a ? a.data.readBigUInt64LE(64) : 0n; };
async function send(ixs: TransactionInstruction[], signers: Keypair[]) {
  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: signers[0].publicKey, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), ...ixs] }).compileToV0Message());
  tx.sign(signers);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed").catch(() => {});
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  const code = Number(JSON.stringify(t?.meta?.err ?? "").match(/"Custom":(\d+)/)?.[1] ?? -1);
  const failed = t?.meta?.logMessages?.find((l) => l.includes(" failed: ")) ?? "";
  return { ok: !t?.meta?.err, code, failed };
}
function record(name: string, r: { ok: boolean; code: number; failed: string }, expect: "pass" | number, detail = "") {
  const pass = expect === "pass" ? r.ok : r.code === expect && r.failed.includes(GUARD_PROGRAM_ID.toBase58());
  results.push({ name, pass, detail: `${r.ok ? "ok" : GUARD_ERRORS[r.code] ?? r.failed} ${detail}`.trim() });
}
const spec = (owner: PublicKey, nonce: bigint, side: "buy" | "sell", amountIn: bigint): OrderSpec => ({
  owner, nonce, feedIdHex: FEED, side, stockMint: NVDAX, stableMint: USDC, stockTokenProgram: TOKEN_2022_PROGRAM, stableTokenProgram: TOKEN_PROGRAM,
  amountIn, maxGapBps: 100, atOpen: false, atClose: true, ttlSecs: 3 * 24 * 3600,
});

(async () => {
  // 16:00 New York today (EDT in late September = 20:00 UTC).
  const now = await forkNow();
  const d = new Date(now * 1000);
  const close = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 20, 0, 0) / 1000);
  if (close <= now) throw new Error("run this before 16:00 New York time");
  const buyer = Keypair.generate(), seller = Keypair.generate(), mm = Keypair.generate(), late = Keypair.generate();
  for (let i = 0; i < 5 && !(await conn.getAccountInfo(NVDAX)); i++) await new Promise((r) => setTimeout(r, 1000));
  for (const [kp, u, n] of [[buyer, 1000, 0], [seller, 0, 5], [mm, 2000, 20], [late, 500, 0]] as const) await fund(kp, u, n);

  await travelTo(close - 600); // 15:50
  const b = spec(buyer.publicKey, 1n, "buy", 400_000_000n);
  const s = spec(seller.publicKey, 1n, "sell", 100_000_000n); // 1 raw NVDAx
  record("1. 15:50: buyer places an at-close order", await send([placeOrderIx(b)], [buyer]), "pass");
  record("2. 15:50: seller places an at-close order", await send([placeOrderIx(s)], [seller]), "pass");
  await setPrice(1, close - 600);
  record("3. a market maker can't fill an at-close order early", await send([fillOrderIx(b, mm.publicKey, 100_000_000n, 40_000_000n, PRICE)], [mm]), 6021);
  await send([crankCloseIx(buyer.publicKey, FEED, PRICE)], [buyer]); // keepers crank from here on
  record("4. crossing before 16:00 is refused", await send([crossAtCloseIx(b, s)], [buyer]), 6023);

  await travelTo(close - 30); // 15:59:30
  const closingPrice = await setPrice(1, close - 5); // last print before the bell, 15:59:55
  record("5. 15:59:30: crank records the last pre-close price", await send([crankCloseIx(buyer.publicKey, FEED, PRICE)], [buyer]), "pass");
  let c = decodeClose((await conn.getAccountInfo(closePda(FEED)))!.data as Buffer);
  results.push({ name: "6. closing price set from the 15:59:55 print", pass: Math.abs(Number(c.priceE6) / 1e6 - closingPrice) < 0.001 && c.sessionClose === close, detail: `close price $${(Number(c.priceE6) / 1e6).toFixed(4)}` });

  await travelTo(close + 40); // 16:00:40
  await setPrice(1.02, close + 20); // after-hours print at 16:00:20, 2% higher
  await send([crankCloseIx(buyer.publicKey, FEED, PRICE)], [buyer]);
  c = decodeClose((await conn.getAccountInfo(closePda(FEED)))!.data as Buffer);
  results.push({ name: "7. an after-hours print (+2%) does not change the closing price", pass: Math.abs(Number(c.priceE6) / 1e6 - closingPrice) < 0.001, detail: `still $${(Number(c.priceE6) / 1e6).toFixed(4)}` });

  const lateSpec = { ...spec(late.publicKey, 1n, "buy", 200_000_000n) };
  await send([placeOrderIx(lateSpec)], [late]);
  record("8. an order placed after 16:00 can't join today's cross", await send([crossAtCloseIx(lateSpec, s)], [late]), 6024);

  const usdcBefore = await bal(seller.publicKey, USDC, TOKEN_PROGRAM);
  record("9. 16:00:40: buyer and seller cross", await send([crossAtCloseIx(b, s)], [buyer]), "pass");
  const got = await bal(buyer.publicKey, NVDAX, TOKEN_2022_PROGRAM);
  const paid = Number((await bal(seller.publicKey, USDC, TOKEN_PROGRAM)) - usdcBefore) / 1e6;
  const mint = (await conn.getAccountInfo(NVDAX))!.data;
  let mult = 1, o = 166;
  while (o + 4 <= mint.length) { const ty = mint.readUInt16LE(o), len = mint.readUInt16LE(o + 2); if (ty === 25) { const ts = Number(mint.readBigInt64LE(o + 44)); mult = (ts && close >= ts) ? mint.readDoubleLE(o + 52) : mint.readDoubleLE(o + 36); break; } o += 4 + len; }
  const implied = paid / ((Number(got) / 1e8) * mult);
  results.push({ name: "10. filled at exactly the closing price", pass: Math.abs(implied - closingPrice) < 0.01, detail: `buyer got ${(Number(got) / 1e8 * mult).toFixed(4)} NVDAx, seller got $${paid.toFixed(2)}, implied $${implied.toFixed(4)} vs close $${closingPrice.toFixed(4)}` });

  await travelTo(close + 360); // 16:06
  record("11. after the 5-minute window, the cross is closed", await send([crossAtCloseIx(b, s)], [buyer]), 6023);
  record("12. buyer cancels the unfilled rest", await send([cancelOrderIx(b)], [buyer]), "pass");

  console.log("\n" + results.map((x) => `${x.pass ? "PASS" : "FAIL"}  ${x.name}\n      ${x.detail}`).join("\n"));
  console.log(`\n${results.filter((x) => x.pass).length}/${results.length} passed`);
  process.exit(results.every((x) => x.pass) ? 0 : 1);
})();
