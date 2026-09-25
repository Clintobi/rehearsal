// The Earn page's flow without a browser wallet: build each transaction through /api/earn/tx,
// sign it with a test keypair, relay it through /api/send, and read the result back from
// /api/earn. Needs the practice fork, the practice app and the keeper with --mm running.
//   APP=http://127.0.0.1:3322 npx tsx scripts/earn-api-test.ts
import { Keypair, LAMPORTS_PER_SOL, Connection, VersionedTransaction } from "@solana/web3.js";
import type { EarnBoard } from "../src/lib/earn-server";

const APP = process.env.APP ?? "http://127.0.0.1:3322";
const FORK = process.env.FORK_RPC ?? "http://127.0.0.1:8899";
const conn = new Connection(FORK, "confirmed");
const w = Keypair.generate();
const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") => results.push({ name, pass, detail });

const forkRpc = async (method: string, params: unknown[]) =>
  (await fetch(FORK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
const board = async (): Promise<EarnBoard> => (await fetch(`${APP}/api/earn?wallet=${w.publicKey.toBase58()}`)).json();

async function act(body: object): Promise<{ ok: boolean; detail: string }> {
  const b = await (await fetch(`${APP}/api/earn/tx`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, wallet: w.publicKey.toBase58() }) })).json();
  if (b.error) return { ok: false, detail: b.error };
  const tx = VersionedTransaction.deserialize(Buffer.from(b.transaction, "base64"));
  tx.sign([w]);
  const s = await (await fetch(`${APP}/api/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signed: Buffer.from(tx.serialize()).toString("base64"), lastValidBlockHeight: b.lastValidBlockHeight }) })).json();
  return s.error ? { ok: false, detail: s.error } : { ok: true, detail: s.signature.slice(0, 10) };
}

(async () => {
  await conn.requestAirdrop(w.publicKey, 2 * LAMPORTS_PER_SOL);
  await forkRpc("surfnet_setTokenAccount", [w.publicKey.toBase58(), "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", { amount: 1000e6 }, "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"]);
  await forkRpc("surfnet_setTokenAccount", [w.publicKey.toBase58(), "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", { amount: 2e8 }, "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]);

  const b0 = await board();
  const nv = b0.stocks.find((s) => s.symbol === "NVDAx")!;
  const m = nv.multiplier;
  const kPut = nv.strikes.put[0], kCall = nv.strikes.call[0];
  const sugPut = nv.suggest.find((s) => s.kind === "put" && s.shareStrike === kPut)!.askPerShare;
  const sugCall = nv.suggest.find((s) => s.kind === "call" && s.shareStrike === kCall)!.askPerShare;
  const base = { symbol: "NVDAx", expiry: b0.expiry };

  // Same conversions as the page: USDC / strike = shares; raw contracts = shares / multiplier x 1e8.
  const putShares = 500 / kPut;
  let r = await act({ ...base, action: "write", kind: "put", strikeE6: String(Math.round(kPut * m * 1e6)), contracts: String(Math.floor((putShares / m) * 1e8)), askE6: String(Math.round(sugPut * m * 1e6)) });
  check(`1. set aside $500 to buy NVDA at $${kPut}, asking $${sugPut}/share`, r.ok, r.detail);
  r = await act({ ...base, action: "write", kind: "call", strikeE6: String(Math.round(kCall * m * 1e6)), contracts: String(Math.floor((1 / m) * 1e8)), askE6: String(Math.round(sugCall * m * 1e6)) });
  check(`2. set aside 1 NVDAx to sell at $${kCall}, asking $${sugCall}/share`, r.ok, r.detail);
  const kFar = nv.strikes.call[2];
  r = await act({ ...base, action: "write", kind: "call", strikeE6: String(Math.round(kFar * m * 1e6)), contracts: String(Math.floor((0.5 / m) * 1e8)), askE6: String(Math.round(50 * m * 1e6)) });
  check(`3. set aside 0.5 NVDAx at $${kFar} with a price nobody will pay ($50)`, r.ok, r.detail);

  let b1 = await board();
  check("4. positions show up for the wallet", b1.positions.length === 3, `${b1.positions.length} positions`);

  // The practice buyer takes asks at or under its estimate within a keeper cycle or two.
  let sold = 0;
  for (let i = 0; i < 9 && sold < 2; i++) {
    await new Promise((res) => setTimeout(res, 10_000));
    b1 = await board();
    sold = b1.positions.filter((p) => BigInt(p.sold) > 0n).length;
  }
  check("5. the practice buyer bought both fairly priced positions", sold === 2, `${sold} of 2 sold`);
  const far = b1.series.find((s) => s.kind === "call" && s.shareStrike === kFar)!;
  const farPos = b1.positions.find((p) => p.series === far.key)!;
  check("6. the $50 ask stayed unsold", farPos.sold === "0", `sold ${farPos.sold}`);

  r = await act({ action: "unwrite", series: far.key, contracts: farPos.contracts });
  check("7. taking back the unsold 0.5 NVDAx works", r.ok, r.detail);
  r = await act({ action: "claim", series: far.key, as: "writer" });
  check("8. claiming before Friday's close explains why not", !r.ok && /15 minutes after/.test(r.detail), r.detail);

  console.log("\n" + results.map((x) => `${x.pass ? "PASS" : "FAIL"}  ${x.name}\n      ${x.detail}`).join("\n"));
  console.log(`\n${results.filter((x) => x.pass).length}/${results.length} passed`);
  process.exit(results.every((x) => x.pass) ? 0 : 1);
})();
