// Submits the execution report's SP1 Groth16 proof (zk/proof/solana.json) to the Rehearsal
// program, which verifies it on-chain and records a ReportAttestation account.
//   DEVNET_RPC=... npx tsx scripts/attest-report.ts
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { GUARD_PROGRAM_ID } from "../src/lib/guard";

const conn = new Connection(process.env.DEVNET_RPC ?? "https://api.devnet.solana.com", "confirmed");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("onchain/keys/deployer.json", "utf8"))));
const j = JSON.parse(readFileSync("zk/proof/solana.json", "utf8"));
const b = (h: string) => Buffer.from(h, "hex");
const pv = b(j.public_values);
const disc = createHash("sha256").update("global:attest_report").digest().subarray(0, 8);
const len = Buffer.alloc(4); len.writeUInt32LE(pv.length);
const attestation = PublicKey.findProgramAddressSync([Buffer.from("report"), pv.subarray(0, 32)], GUARD_PROGRAM_ID)[0];

(async () => {
  const existing = await conn.getAccountInfo(attestation);
  if (existing) { console.log("already attested:", attestation.toBase58()); return decode(existing.data); }
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
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }), ix] }).compileToV0Message());
  tx.sign([payer]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed");
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  console.log(t?.meta?.err ? `FAILED ${JSON.stringify(t.meta.err)}` : "VERIFIED ON-CHAIN", `compute units: ${t?.meta?.computeUnitsConsumed}`);
  console.log(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  if (t?.meta?.err) { console.log(t.meta.logMessages?.slice(-6).join("\n")); process.exit(1); }
  decode((await conn.getAccountInfo(attestation))!.data);
})();

function decode(d: Buffer) {
  let o = 8;
  const ds = d.subarray(o, o + 32).toString("hex"); o += 32;
  const fills = d.readUInt32LE(o); o += 4;
  const st = () => { const s = { graded: d.readUInt32LE(o), volume_usd: Number(d.readBigUInt64LE(o + 4)) / 1e6, median_bps: d.readInt32LE(o + 12), p90_bps: d.readInt32LE(o + 16), within_25bps: d.readUInt32LE(o + 20) }; o += 24; return s; };
  console.log("attestation", attestation.toBase58(), { dataset_sha256: ds, fills, xstock: st(), prestock: st() });
}
