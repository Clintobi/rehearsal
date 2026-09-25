// Proves the devnet deployment executes its checks. Devnet has no Jupiter/xStocks, so the
// full swap path is tested on the mainnet fork (fork-test.ts); here we hit the guard's own rules.
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { readFileSync } from "fs";
import { closePda, crankCloseIx, crankCrossIx, crossPda, decodeClose, decodeCross, ata, breakerPda, checkBreakerIx, closeGuardIx, crankBreakerIx, decodeBreaker, GUARD_ERRORS, GUARD_PROGRAM_ID, initBreakerIx, openGuardIx, setHaltIx, TOKEN_PROGRAM, type GuardLegs, type Policy } from "../src/lib/guard";

const conn = new Connection(process.env.DEVNET_RPC ?? "https://api.devnet.solana.com", "confirmed");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("onchain/keys/deployer.json", "utf8"))));
const USDC_DEV = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const createAtaIdempotent = (owner: PublicKey, mint: PublicKey, prog: PublicKey) => new TransactionInstruction({
  programId: ATA_PROGRAM, data: Buffer.from([1]),
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true }, { pubkey: ata(owner, mint, prog), isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false }, { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false }, { pubkey: prog, isSigner: false, isWritable: false },
  ],
});

async function run(name: string, ixs: TransactionInstruction[], expect: number) {
  // expect: an error code, or 0 for success
  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...ixs] }).compileToV0Message());
  tx.sign([payer]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed").catch(() => {});
  let t = null;
  for (let i = 0; i < 20 && !t; i++) { t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null); if (!t) await new Promise((r) => setTimeout(r, 1000)); }

  const code = Number(JSON.stringify(t?.meta?.err ?? "").match(/"Custom":(\d+)/)?.[1] ?? -1);
  const ok = expect === 0 ? !t?.meta?.err : code === expect;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${t?.meta?.err ? GUARD_ERRORS[code] ?? JSON.stringify(t?.meta?.err) : "ok"}  https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

(async () => {
  console.log("program", GUARD_PROGRAM_ID.toBase58(), "on devnet, payer", payer.publicKey.toBase58());
  // Both legs are devnet USDC here: this exercises the guard's own rules, not a swap.
  const legs: GuardLegs = { user: payer.publicKey, inputMint: USDC_DEV, inputTokenProgram: TOKEN_PROGRAM, outputMint: USDC_DEV, outputTokenProgram: TOKEN_PROGRAM };
  const policy: Policy = { side: "buy", reference: { kind: "limit", priceE6: 1_000_000n }, toleranceBps: 100 };
  const setup = createAtaIdempotent(payer.publicKey, USDC_DEV, TOKEN_PROGRAM);
  await run("open_guard with no close_guard reverts", [setup, openGuardIx(legs, policy)], 6001);
  await run("open → close with no swap in between reverts", [setup, openGuardIx(legs, policy), closeGuardIx(legs)], 6012);
  await run("tolerance above 50% is rejected", [setup, openGuardIx(legs, { ...policy, toleranceBps: 6000 }), closeGuardIx(legs)], 6002);

  // Circuit breaker on the one Pyth feed devnet carries (SOL/USD, shard 0).
  const SOL_FEED = "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
  const SOL_PRICE = new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");
  if (!(await conn.getAccountInfo(breakerPda(SOL_FEED)))) await run("init SOL/USD breaker", [initBreakerIx(payer.publicKey, SOL_FEED, 500, 15, 300, 600)], 0);
  await run("crank the SOL/USD breaker from the live devnet Pyth account", [crankBreakerIx(SOL_FEED, SOL_PRICE)], 0);
  const b = decodeBreaker((await conn.getAccountInfo(breakerPda(SOL_FEED)))!.data as Buffer);
  console.log(`      breaker: state=${b.state} reference=$${(Number(b.referenceE6) / 1e6).toFixed(2)} band=${b.bandBps}bps`);
  await run("check_breaker passes while Normal", [crankBreakerIx(SOL_FEED, SOL_PRICE), checkBreakerIx(SOL_FEED)], 0);
  await run("post an exchange halt", [setHaltIx(payer.publicKey, SOL_FEED, true, "T1")], 0);
  await run("check_breaker fails while halted", [crankBreakerIx(SOL_FEED, SOL_PRICE), checkBreakerIx(SOL_FEED)], 6017);
  await run("lift the halt", [setHaltIx(payer.publicKey, SOL_FEED, false)], 0);
  await run("check_breaker passes again", [crankBreakerIx(SOL_FEED, SOL_PRICE), checkBreakerIx(SOL_FEED)], 0);

  // Opening cross: arm it from the live feed. A cross opens only after the feed was silent
  // for 30+ minutes (weekend or holiday), which a 24/7 SOL feed never is, so it stays armed.
  await run("crank_cross records the latest publish time (armed, no reopen)", [crankCrossIx(payer.publicKey, SOL_FEED, SOL_PRICE)], 0);
  const c = decodeCross((await conn.getAccountInfo(crossPda(SOL_FEED)))!.data as Buffer);
  console.log(`      cross: last publish ${new Date(c.lastPublishSeen * 1000).toISOString()}, crosses=${c.crosses}`);

  // Closing cross: record the last price published at or before today's 16:00 New York close.
  await run("crank_close records today's pre-close price", [crankCloseIx(payer.publicKey, SOL_FEED, SOL_PRICE)], 0);
  const k = decodeClose((await conn.getAccountInfo(closePda(SOL_FEED)))!.data as Buffer);
  console.log(`      close: session ${new Date(k.sessionClose * 1000).toISOString()}, price $${(Number(k.priceE6) / 1e6).toFixed(4)} published ${new Date(Number(k.pricePublish) * 1000).toISOString()}`);
})();
