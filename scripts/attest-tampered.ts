// Negative test: same proof, one committed number changed. The program must reject it.
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { GUARD_PROGRAM_ID } from "../src/lib/guard";

const conn = new Connection(process.env.DEVNET_RPC ?? "https://api.devnet.solana.com", "confirmed");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("onchain/keys/deployer.json", "utf8"))));
const j = JSON.parse(readFileSync("zk/proof/solana.json", "utf8"));
const b = (h: string) => Buffer.from(h, "hex");
const pv = b(j.public_values);
pv[5] ^= 0x01; // claim a different dataset (fresh account), same proof
const disc = createHash("sha256").update("global:attest_report").digest().subarray(0, 8);
const len = Buffer.alloc(4); len.writeUInt32LE(pv.length);
const attestation = PublicKey.findProgramAddressSync([Buffer.from("report"), pv.subarray(0, 32)], GUARD_PROGRAM_ID)[0];

(async () => {
  const ix = new TransactionInstruction({
    programId: GUARD_PROGRAM_ID,
    data: Buffer.concat([disc, b(j.pi_a), b(j.pi_b), b(j.pi_c), b(j.nonce), len, pv]),
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: attestation, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
  const { blockhash } = await conn.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ix] }).compileToV0Message());
  tx.sign([payer]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed").catch(() => {});
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  const msg = t?.meta?.logMessages?.find((l) => l.includes("Error Message")) ?? JSON.stringify(t?.meta?.err);
  console.log(t?.meta?.err ? "REJECTED (expected):" : "ACCEPTED (BAD):", msg);
  console.log(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
})();
