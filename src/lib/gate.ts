// Client for the Rehearsal Gate transfer hook (onchain/programs/rehearsal_gate).
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { createHash } from "crypto";
import { breakerPda } from "./guard";

export const GATE_PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_GATE_PROGRAM_ID ?? "4MtrgDQpbgjpzcAcL5Ftm8E1L37deBnZ5f2Pi6WmpqPE");

export const extraAccountMetasPda = (mint: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("extra-account-metas"), mint.toBuffer()], GATE_PROGRAM_ID)[0];

const disc = (name: string) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);

// Bind a launch mint to the breaker of the stock it's quoted in. Put it in the pool-creation transaction.
export function initGateIx(payer: PublicKey, mint: PublicKey, feedIdHex: string) {
  return new TransactionInstruction({
    programId: GATE_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: extraAccountMetasPda(mint), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: breakerPda(feedIdHex), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: disc("init_gate"),
  });
}

export const GATE_ERRORS: Record<number, string> = {
  6000: "The stock this token trades against is halted on its primary exchange",
  6001: "The stock's circuit breaker has paused trading",
};
