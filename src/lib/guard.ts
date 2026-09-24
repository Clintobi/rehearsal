// Client for the Rehearsal Guard program. Wraps any swap's instructions as
//   [compute budget] open_guard → setup → swap → cleanup → close_guard
// so the whole transaction reverts if the fill is worse than fair value.
import { createHash } from "crypto";
import {
  AddressLookupTableAccount, ComputeBudgetProgram, Connection, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";

export const GUARD_PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_GUARD_PROGRAM_ID ?? "TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE");
export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export type Policy = {
  side: "buy" | "sell";
  reference: { kind: "pyth"; feedId: string; maxAgeSecs: number; maxConfBps: number } | { kind: "limit"; priceE6: bigint };
  toleranceBps: number;
};

const disc = (name: string) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);

export function encodePolicy(p: Policy): Buffer {
  const parts: Buffer[] = [Buffer.from([p.side === "buy" ? 0 : 1])];
  if (p.reference.kind === "pyth") {
    const b = Buffer.alloc(1 + 32 + 4 + 2);
    b[0] = 0;
    Buffer.from(p.reference.feedId.replace(/^0x/, ""), "hex").copy(b, 1);
    b.writeUInt32LE(p.reference.maxAgeSecs, 33);
    b.writeUInt16LE(p.reference.maxConfBps, 37);
    parts.push(b);
  } else {
    const b = Buffer.alloc(9);
    b[0] = 1;
    b.writeBigUInt64LE(p.reference.priceE6, 1);
    parts.push(b);
  }
  const t = Buffer.alloc(2);
  t.writeUInt16LE(p.toleranceBps);
  parts.push(t);
  return Buffer.concat(parts);
}

export const pda = (seed: string, user?: PublicKey) =>
  PublicKey.findProgramAddressSync(user ? [Buffer.from(seed), user.toBuffer()] : [Buffer.from(seed)], GUARD_PROGRAM_ID)[0];

export function ata(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey) {
  return PublicKey.findProgramAddressSync([owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0];
}

export type GuardLegs = {
  user: PublicKey;
  inputMint: PublicKey; inputTokenProgram: PublicKey;
  outputMint: PublicKey; outputTokenProgram: PublicKey;
  priceUpdate?: PublicKey; // Pyth PriceUpdateV2 account when the policy uses Pyth
};

export function openGuardIx(l: GuardLegs, policy: Policy): TransactionInstruction {
  return new TransactionInstruction({
    programId: GUARD_PROGRAM_ID,
    keys: [
      { pubkey: l.user, isSigner: true, isWritable: true },
      { pubkey: pda("guard", l.user), isSigner: false, isWritable: true },
      { pubkey: l.inputMint, isSigner: false, isWritable: false },
      { pubkey: l.outputMint, isSigner: false, isWritable: false },
      { pubkey: ata(l.user, l.inputMint, l.inputTokenProgram), isSigner: false, isWritable: false },
      { pubkey: ata(l.user, l.outputMint, l.outputTokenProgram), isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([disc("open_guard"), encodePolicy(policy)]),
  });
}

export function closeGuardIx(l: GuardLegs): TransactionInstruction {
  return new TransactionInstruction({
    programId: GUARD_PROGRAM_ID,
    keys: [
      { pubkey: l.user, isSigner: true, isWritable: true },
      { pubkey: pda("guard", l.user), isSigner: false, isWritable: true },
      { pubkey: l.inputMint, isSigner: false, isWritable: false },
      { pubkey: l.outputMint, isSigner: false, isWritable: false },
      { pubkey: ata(l.user, l.inputMint, l.inputTokenProgram), isSigner: false, isWritable: false },
      { pubkey: ata(l.user, l.outputMint, l.outputTokenProgram), isSigner: false, isWritable: false },
      // Anchor encodes a missing Option<Account> as the program id itself
      { pubkey: l.priceUpdate ?? GUARD_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: pda("ledger", l.user), isSigner: false, isWritable: true },
      { pubkey: pda("stats"), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: disc("close_guard"),
  });
}

// Jupiter /swap-instructions response, trimmed to what we use.
type JupIx = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string };
export type JupSwapIxs = {
  computeBudgetInstructions: JupIx[]; setupInstructions: JupIx[]; swapInstruction: JupIx;
  cleanupInstruction?: JupIx | null; otherInstructions?: JupIx[]; addressLookupTableAddresses: string[];
};

const toIx = (i: JupIx) => new TransactionInstruction({
  programId: new PublicKey(i.programId),
  keys: i.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
  data: Buffer.from(i.data, "base64"),
});

export async function buildGuardedSwap(conn: Connection, jup: JupSwapIxs, legs: GuardLegs, policy: Policy) {
  const alts = (await Promise.all(jup.addressLookupTableAddresses.map((a) => conn.getAddressLookupTable(new PublicKey(a)))))
    .map((r) => r.value).filter((v): v is AddressLookupTableAccount => !!v);
  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
    ...jup.computeBudgetInstructions.map(toIx).filter((i) => !i.data.length || i.data[0] !== 2), // keep price, drop Jupiter's CU limit
    ...jup.setupInstructions.map(toIx),
    openGuardIx(legs, policy),
    toIx(jup.swapInstruction),
    ...(jup.cleanupInstruction ? [toIx(jup.cleanupInstruction)] : []),
    ...(jup.otherInstructions ?? []).map(toIx),
    closeGuardIx(legs),
  ];
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const msg = new TransactionMessage({ payerKey: legs.user, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(alts);
  return { tx: new VersionedTransaction(msg), lastValidBlockHeight };
}

// Error codes from the program (Anchor custom errors start at 6000).
export const GUARD_ERRORS: Record<number, string> = {
  6000: "Blocked: the fill was worse than fair value by more than your tolerance",
  6001: "open_guard without a matching close_guard",
  6002: "Tolerance out of range",
  6003: "Stablecoin leg is not USDC/USDT/PYUSD",
  6004: "Token account mismatch",
  6005: "Missing Pyth account",
  6006: "Not a Pyth price account",
  6007: "Pyth feed mismatch",
  6008: "Pyth update only partially verified",
  6009: "Pyth price is stale",
  6010: "Pyth confidence too wide",
  6011: "Bad oracle price",
  6012: "Swap spent nothing",
  6013: "Swap delivered nothing",
  6014: "Overflow",
  6015: "Malformed mint data",
};
