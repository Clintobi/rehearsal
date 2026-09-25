// Rehearsal Earn end to end on a Surfpool mainnet fork: the real NVDAx and USDC mints and
// the real NVDA Pyth account. Series expire at 16:00 New York today.
// Run before 15:40 New York: MAINNET_RPC=<helius url> npx tsx scripts/fork-earn-test.ts
import { forkConnection } from "./fork-conn";
import { ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { readFileSync } from "fs";
import { ata, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "../src/lib/guard";
import { feedAccount } from "../src/lib/pyth";
import {
  CALL, PUT, EARN_ERRORS, EARN_PROGRAM_ID, buyIx, claimBuyerIx, claimWriterIx, createMarketIx, createSeriesIx, decodeSeries,
  finalizeIx, nyClose, seriesPda, snapshotIx, unwriteIx, vaultPda, writeOptionsIx, type SeriesKey,
} from "../src/lib/earn";

const FORK = process.env.FORK_RPC ?? "http://127.0.0.1:8899";
const conn = forkConnection(FORK);
const mainnet = new Connection(process.env.MAINNET_RPC!, "confirmed");
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const NVDAX = new PublicKey("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
const TSLAX = new PublicKey("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
const FEED = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";
const PRICE = feedAccount(FEED, 1);
const P = { stock: TOKEN_2022_PROGRAM, stable: TOKEN_PROGRAM };
const TOKEN = 100_000_000n; // one whole NVDAx
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("onchain/keys/deployer.json", "utf8"))));
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

// The NVDA Pyth account on the fork: live mainnet bytes with the price scaled and a chosen publish time.
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
const rawBal = async (acct: PublicKey) => { const a = await conn.getAccountInfo(acct); return a ? a.data.readBigUInt64LE(64) : 0n; };
async function multiplier(at: number) {
  const mint = (await conn.getAccountInfo(NVDAX))!.data;
  let o = 166;
  while (o + 4 <= mint.length) {
    const ty = mint.readUInt16LE(o), len = mint.readUInt16LE(o + 2);
    if (ty === 25) { const ts = Number(mint.readBigInt64LE(o + 44)); return ts && at >= ts ? mint.readDoubleLE(o + 52) : mint.readDoubleLE(o + 36); }
    o += 4 + len;
  }
  return 1;
}
async function send(ixs: TransactionInstruction[], signers: Keypair[]) {
  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: signers[0].publicKey, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), ...ixs] }).compileToV0Message());
  tx.sign(signers);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed").catch(() => {});
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  const code = Number(JSON.stringify(t?.meta?.err ?? "").match(/"Custom":(\d+)/)?.[1] ?? -1);
  const failed = t?.meta?.logMessages?.find((l) => l.includes(" failed: ")) ?? "";
  return { ok: !t?.meta?.err, code, failed, logs: t?.meta?.logMessages ?? [] };
}
function record(name: string, r: { ok: boolean; code: number; failed: string; logs: string[] }, expect: "pass" | number, detail = "") {
  const pass = expect === "pass" ? r.ok : r.code === expect && r.failed.includes(EARN_PROGRAM_ID.toBase58());
  if (!pass) console.log(name, r.logs.slice(-8).join("\n"));
  results.push({ name, pass, detail: `${r.ok ? "ok" : EARN_ERRORS[r.code] ?? r.failed} ${detail}`.trim() });
}
const check = (name: string, pass: boolean, detail: string) => results.push({ name, pass, detail });
const usd = (e6: bigint | number) => `$${(Number(e6) / 1e6).toFixed(4)}`;

(async () => {
  const now = await forkNow();
  const d = new Date(now * 1000);
  const close = nyClose(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  if (close - now < 20 * 60) throw new Error("run this before 15:40 New York time");
  for (let i = 0; i < 5 && !(await conn.getAccountInfo(NVDAX)); i++) await new Promise((r) => setTimeout(r, 1000));

  const callA = Keypair.generate(), callB = Keypair.generate(), putC = Keypair.generate(), buyer = Keypair.generate(), stranger = Keypair.generate();
  for (const [kp, u, n] of [[callA, 1, 2], [callB, 1, 2], [putC, 2000, 0], [buyer, 500, 0], [stranger, 10, 0]] as const) await fund(kp, u, n);
  await conn.confirmTransaction(await conn.requestAirdrop(admin.publicKey, 5 * LAMPORTS_PER_SOL));

  // Today's close price and the strikes around it (USD per whole token = share price x multiplier).
  const share0 = await setPrice(1, now - 5);
  const m = await multiplier(close);
  const token0 = share0 * m;
  const kCall = BigInt(Math.round(token0 * 0.97 * 1e6)); // in the money at an unchanged close
  const kPut = BigInt(Math.round(token0 * 1.03 * 1e6));
  const call: SeriesKey = { stockMint: NVDAX, stableMint: USDC, kind: CALL, strikeE6: kCall, expiry: close };
  const put: SeriesKey = { stockMint: NVDAX, stableMint: USDC, kind: PUT, strikeE6: kPut, expiry: close };

  record("1. the upgrade authority lists NVDAx with its Pyth feed", await send([createMarketIx(admin.publicKey, NVDAX, FEED)], [admin]), "pass");
  record("2. anyone else can't list a stock", await send([createMarketIx(stranger.publicKey, TSLAX, FEED)], [stranger]), 6000);
  record("3. a series must expire at a 16:00 New York close", await send([createSeriesIx(stranger.publicKey, { ...call, expiry: close - 3600 }, P)], [stranger]), 6002);
  record("4. anyone opens a call and a put series for today's close", await send([createSeriesIx(stranger.publicKey, call, P), createSeriesIx(stranger.publicKey, put, P)], [stranger]), "pass", `call strike ${usd(kCall)}, put strike ${usd(kPut)} per token`);

  record("5. writer A escrows 1 NVDAx, asking $2.00 per token", await send([writeOptionsIx(callA.publicKey, call, P, TOKEN, 2_000_000n)], [callA]), "pass");
  record("6. writer B escrows 0.5 NVDAx, asking $1.50", await send([writeOptionsIx(callB.publicKey, call, P, TOKEN / 2n, 1_500_000n)], [callB]), "pass");
  const putCollateral = (2n * TOKEN * kPut + TOKEN - 1n) / TOKEN;
  const cBefore = await bal(putC.publicKey, USDC, TOKEN_PROGRAM);
  record("7. writer C escrows USDC for 2 tokens of puts, asking $1.80", await send([writeOptionsIx(putC.publicKey, put, P, 2n * TOKEN, 1_800_000n)], [putC]), "pass");
  check("8. put collateral is exactly 2 x strike", cBefore - (await bal(putC.publicKey, USDC, TOKEN_PROGRAM)) === putCollateral, `${usd(putCollateral)} escrowed`);

  const bBefore = await bal(callB.publicKey, USDC, TOKEN_PROGRAM);
  record("9. buyer's $1.80 limit skips A ($2.00) and fills B (0.5 token)", await send([buyIx(buyer.publicKey, call, P, [callA.publicKey, callB.publicKey], 12n * TOKEN / 10n, 1_800_000n)], [buyer]), "pass");
  const bGot = (await bal(callB.publicKey, USDC, TOKEN_PROGRAM)) - bBefore;
  check("10. writer B was paid $0.75 premium, straight to their wallet", bGot === 750_000n, `B received ${usd(bGot)}`);
  record("11. buyer takes 0.7 token from A at $2.00", await send([buyIx(buyer.publicKey, call, P, [callA.publicKey], 7n * TOKEN / 10n, 2_100_000n)], [buyer]), "pass");
  record("12. buyer buys 2 tokens of puts from C", await send([buyIx(buyer.publicKey, put, P, [putC.publicKey], 2n * TOKEN, 1_800_000n)], [buyer]), "pass");
  record("13. writer A takes back the 0.3 token nobody bought", await send([unwriteIx(callA.publicKey, call, P, 3n * TOKEN / 10n)], [callA]), "pass");
  record("14. but not sold contracts", await send([unwriteIx(callA.publicKey, call, P, 1n)], [callA]), 6005);

  await travelTo(close - 600); // 15:50
  record("15. writing stops 15 minutes before the close", await send([writeOptionsIx(callB.publicKey, call, P, TOKEN / 10n, 1_000_000n)], [callB]), 6003);
  await setPrice(1, close - 600);
  record("16. no snapshot earlier than 5 minutes before the close", await send([snapshotIx(call, PRICE)], [stranger]), 6009);

  await travelTo(close - 30); // 15:59:30
  const shareClose = await setPrice(1, close - 5); // last print before the bell
  record("17. keeper snapshots the 15:59:55 print on both series", await send([snapshotIx(call, PRICE), snapshotIx(put, PRICE)], [stranger]), "pass");
  await setPrice(0.9, close - 120); // an earlier, 10% lower print
  await send([snapshotIx(call, PRICE)], [stranger]);
  let s = decodeSeries((await conn.getAccountInfo(seriesPda(call)))!.data as Buffer);
  check("18. an earlier print can't replace a later one", s.snapPublish === close - 5, `kept ${usd(s.snapPriceE6)} from 15:59:55`);

  await travelTo(close + 60);
  await setPrice(1.05, close + 20); // after-hours print
  record("19. an after-hours print is refused", await send([snapshotIx(call, PRICE)], [stranger]), 6010);
  record("20. nobody can fix the price before 16:15", await send([finalizeIx(call)], [stranger]), 6009);

  await travelTo(close + 16 * 60);
  record("21. 16:16: both series settle", await send([finalizeIx(call), finalizeIx(put)], [stranger]), "pass");
  s = decodeSeries((await conn.getAccountInfo(seriesPda(call)))!.data as Buffer);
  const px = s.settlePriceE6;
  check("22. settled on the last pre-close print x the token multiplier", Math.abs(Number(px) / 1e6 - shareClose * m) < 0.01, `${usd(px)} per token (share $${shareClose.toFixed(4)} x ${m})`);
  record("23. buying after the close is refused", await send([buyIx(stranger.publicKey, call, P, [callA.publicKey], 1n, 9_000_000n)], [stranger]), 6003);

  const callSold = TOKEN / 2n + 7n * TOKEN / 10n;
  const nBefore = await bal(buyer.publicKey, NVDAX, TOKEN_2022_PROGRAM);
  record("24. call buyer claims", await send([claimBuyerIx(buyer.publicKey, call, P)], [buyer]), "pass");
  const nGot = (await bal(buyer.publicKey, NVDAX, TOKEN_2022_PROGRAM)) - nBefore;
  const nWant = (callSold * (px - kCall)) / px;
  check("25. call buyer gets (close - strike) / close in NVDAx", nGot === nWant, `${(Number(nGot) / 1e8).toFixed(8)} NVDAx`);

  const uBefore = await bal(buyer.publicKey, USDC, TOKEN_PROGRAM);
  record("26. put buyer claims", await send([claimBuyerIx(buyer.publicKey, put, P)], [buyer]), "pass");
  const uGot = (await bal(buyer.publicKey, USDC, TOKEN_PROGRAM)) - uBefore;
  const uWant = (2n * TOKEN * (kPut - px)) / TOKEN;
  check("27. put buyer gets 2 x (strike - close) in USDC", uGot === uWant, `${usd(uGot)}`);

  for (const [w, k, name] of [[callA, call, "A"], [callB, call, "B"], [putC, put, "C"]] as const) {
    record(`28${name}. writer ${name} claims what's left`, await send([claimWriterIx(w.publicKey, k, P)], [w]), "pass");
  }
  const vCall = await rawBal(vaultPda(seriesPda(call)));
  const vPut = await rawBal(vaultPda(seriesPda(put)));
  check("29. vaults end with only rounding dust", vCall <= 2n && vPut <= 2n, `call vault ${vCall} raw, put vault ${vPut} raw left`);

  console.log("\n" + results.map((x) => `${x.pass ? "PASS" : "FAIL"}  ${x.name}\n      ${x.detail}`).join("\n"));
  console.log(`\n${results.filter((x) => x.pass).length}/${results.length} passed`);
  process.exit(results.every((x) => x.pass) ? 0 : 1);
})();
