// Proves the devnet deployment executes its checks. Devnet has no Jupiter/xStocks, so the
// full swap path is tested on the mainnet fork (fork-test.ts); here we hit the guard's own rules.
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { readFileSync } from "fs";
import { ata, closeGuardIx, GUARD_ERRORS, GUARD_PROGRAM_ID, openGuardIx, TOKEN_PROGRAM, type GuardLegs, type Policy } from "../src/lib/guard";

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
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
  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...ixs] }).compileToV0Message());
  tx.sign([payer]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed");
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  const code = Number(JSON.stringify(t?.meta?.err ?? "").match(/"Custom":(\d+)/)?.[1] ?? -1);
  console.log(`${code === expect ? "PASS" : "FAIL"}  ${name}: ${GUARD_ERRORS[code] ?? JSON.stringify(t?.meta?.err)}  https://explorer.solana.com/tx/${sig}?cluster=devnet`);
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
})();
