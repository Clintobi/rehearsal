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
  driftBpsPerHour?: number; // discovery bounds: extra tolerance per hour of oracle silence
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
  const t = Buffer.alloc(4);
  t.writeUInt16LE(p.toleranceBps, 0);
  t.writeUInt16LE(p.driftBpsPerHour ?? 0, 2);
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
  breaker?: PublicKey; // shared circuit breaker for the stock's feed; crank it in the same tx
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
      { pubkey: l.breaker ?? GUARD_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: pda("ledger", l.user), isSigner: false, isWritable: true },
      { pubkey: pda("stats"), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: disc("close_guard"),
  });
}

export const breakerPda = (feedIdHex: string) =>
  PublicKey.findProgramAddressSync([Buffer.from("breaker"), Buffer.from(feedIdHex.replace(/^0x/, ""), "hex")], GUARD_PROGRAM_ID)[0];

export function initBreakerIx(authority: PublicKey, feedIdHex: string, bandBps: number, limitSecs = 15, pauseSecs = 300, maxAgeSecs = 120) {
  const d = Buffer.alloc(8 + 32 + 2 + 4 + 4 + 4);
  disc("init_breaker").copy(d, 0);
  Buffer.from(feedIdHex.replace(/^0x/, ""), "hex").copy(d, 8);
  d.writeUInt16LE(bandBps, 40); d.writeUInt32LE(limitSecs, 42); d.writeUInt32LE(pauseSecs, 46); d.writeUInt32LE(maxAgeSecs, 50);
  return new TransactionInstruction({
    programId: GUARD_PROGRAM_ID, data: d,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: breakerPda(feedIdHex), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
}

export const crankBreakerIx = (feedIdHex: string, priceUpdate: PublicKey) => new TransactionInstruction({
  programId: GUARD_PROGRAM_ID, data: disc("crank_breaker"),
  keys: [{ pubkey: breakerPda(feedIdHex), isSigner: false, isWritable: true }, { pubkey: priceUpdate, isSigner: false, isWritable: false }],
});

export function setHaltIx(authority: PublicKey, feedIdHex: string, halted: boolean, reason = "") {
  const r = Buffer.alloc(4); Buffer.from(reason.slice(0, 4), "ascii").copy(r);
  return new TransactionInstruction({
    programId: GUARD_PROGRAM_ID, data: Buffer.concat([disc("set_halt"), Buffer.from([halted ? 1 : 0]), r]),
    keys: [{ pubkey: authority, isSigner: true, isWritable: false }, { pubkey: breakerPda(feedIdHex), isSigner: false, isWritable: true }],
  });
}

export const checkBreakerIx = (feedIdHex: string) => new TransactionInstruction({
  programId: GUARD_PROGRAM_ID, data: disc("check_breaker"), keys: [{ pubkey: breakerPda(feedIdHex), isSigner: false, isWritable: false }],
});

export type BreakerView = {
  state: "normal" | "limit" | "paused"; bandBps: number; referenceE6: bigint; lastPriceE6: bigint; lastCrank: number;
  pausedUntil: number; exchangeHalted: boolean; haltReason: string; haltSince: number; trips: number;
};
export function decodeBreaker(data: Buffer): BreakerView {
  let o = 8 + 32 + 32;
  const bandBps = data.readUInt16LE(o); o += 2 + 4 + 4 + 4 + 4;
  const referenceE6 = data.readBigUInt64LE(o); o += 8;
  const lastPriceE6 = data.readBigUInt64LE(o); o += 8;
  o += 8; // last_publish
  const lastCrank = Number(data.readBigInt64LE(o)); o += 8;
  const state = (["normal", "limit", "paused"] as const)[data[o]]; o += 1;
  o += 8; // state_since
  const pausedUntil = Number(data.readBigInt64LE(o)); o += 8;
  const exchangeHalted = data[o] === 1; o += 1;
  const haltReason = data.subarray(o, o + 4).toString("ascii").replace(/\0/g, ""); o += 4;
  const haltSince = Number(data.readBigInt64LE(o)); o += 8;
  const trips = data.readUInt32LE(o);
  return { state, bandBps, referenceE6, lastPriceE6, lastCrank, pausedUntil, exchangeHalted, haltReason, haltSince, trips };
}

// ---------------------------------------------------------------- fair orders

const u64 = (n: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };
const feedBytes = (hex: string) => Buffer.from(hex.replace(/^0x/, ""), "hex");
export const orderPda = (owner: PublicKey, nonce: bigint) =>
  PublicKey.findProgramAddressSync([Buffer.from("order"), owner.toBuffer(), u64(nonce)], GUARD_PROGRAM_ID)[0];
export const crossPda = (feedIdHex: string) => PublicKey.findProgramAddressSync([Buffer.from("cross"), feedBytes(feedIdHex)], GUARD_PROGRAM_ID)[0];

export type OrderSpec = {
  owner: PublicKey; nonce: bigint; feedIdHex: string; side: "buy" | "sell";
  stockMint: PublicKey; stableMint: PublicKey; stockTokenProgram: PublicKey; stableTokenProgram: PublicKey;
  amountIn: bigint; maxGapBps: number; atOpen: boolean; ttlSecs: number;
  atClose?: boolean;
};

export function placeOrderIx(o: OrderSpec) {
  const buy = o.side === "buy";
  const inMint = buy ? o.stableMint : o.stockMint;
  const inProg = buy ? o.stableTokenProgram : o.stockTokenProgram;
  const order = orderPda(o.owner, o.nonce);
  const tail = Buffer.alloc(1 + 8 + 2 + 1 + 4 + 1);
  tail[0] = buy ? 0 : 1; tail.writeBigUInt64LE(o.amountIn, 1); tail.writeUInt16LE(o.maxGapBps, 9); tail[11] = o.atOpen ? 1 : 0; tail.writeUInt32LE(o.ttlSecs, 12); tail[16] = o.atClose ? 1 : 0;
  return new TransactionInstruction({
    programId: GUARD_PROGRAM_ID,
    data: Buffer.concat([disc("place_order"), u64(o.nonce), feedBytes(o.feedIdHex), tail]),
    keys: [
      { pubkey: o.owner, isSigner: true, isWritable: true },
      { pubkey: order, isSigner: false, isWritable: true },
      { pubkey: o.stockMint, isSigner: false, isWritable: false },
      { pubkey: o.stableMint, isSigner: false, isWritable: false },
      { pubkey: inMint, isSigner: false, isWritable: false },
      { pubkey: ata(o.owner, inMint, inProg), isSigner: false, isWritable: true },
      { pubkey: ata(order, inMint, inProg), isSigner: false, isWritable: true },
      { pubkey: inProg, isSigner: false, isWritable: false },
      { pubkey: ATA_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
}

export function fillOrderIx(o: OrderSpec, filler: PublicKey, amountIn: bigint, amountOut: bigint, priceUpdate: PublicKey, breaker?: PublicKey) {
  const buy = o.side === "buy";
  const [inMint, inProg, outMint, outProg] = buy
    ? [o.stableMint, o.stableTokenProgram, o.stockMint, o.stockTokenProgram]
    : [o.stockMint, o.stockTokenProgram, o.stableMint, o.stableTokenProgram];
  const order = orderPda(o.owner, o.nonce);
  return new TransactionInstruction({
    programId: GUARD_PROGRAM_ID,
    data: Buffer.concat([disc("fill_order"), u64(amountIn), u64(amountOut)]),
    keys: [
      { pubkey: filler, isSigner: true, isWritable: false },
      { pubkey: order, isSigner: false, isWritable: true },
      { pubkey: ata(order, inMint, inProg), isSigner: false, isWritable: true },
      { pubkey: inMint, isSigner: false, isWritable: false },
      { pubkey: outMint, isSigner: false, isWritable: false },
      { pubkey: ata(filler, inMint, inProg), isSigner: false, isWritable: true },
      { pubkey: ata(filler, outMint, outProg), isSigner: false, isWritable: true },
      { pubkey: ata(o.owner, outMint, outProg), isSigner: false, isWritable: true },
      { pubkey: priceUpdate, isSigner: false, isWritable: false },
      { pubkey: breaker ?? GUARD_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: inProg, isSigner: false, isWritable: false },
      { pubkey: outProg, isSigner: false, isWritable: false },
    ],
  });
}

export const crankCrossIx = (payer: PublicKey, feedIdHex: string, priceUpdate: PublicKey) => new TransactionInstruction({
  programId: GUARD_PROGRAM_ID, data: Buffer.concat([disc("crank_cross"), feedBytes(feedIdHex)]),
  keys: [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: crossPda(feedIdHex), isSigner: false, isWritable: true },
    { pubkey: priceUpdate, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
});

export function crossOrdersIx(buy: OrderSpec, sell: OrderSpec) {
  const bo = orderPda(buy.owner, buy.nonce), so = orderPda(sell.owner, sell.nonce);
  return new TransactionInstruction({
    programId: GUARD_PROGRAM_ID, data: disc("cross_orders"),
    keys: [
      { pubkey: crossPda(buy.feedIdHex), isSigner: false, isWritable: true },
      { pubkey: bo, isSigner: false, isWritable: true },
      { pubkey: ata(bo, buy.stableMint, buy.stableTokenProgram), isSigner: false, isWritable: true },
      { pubkey: so, isSigner: false, isWritable: true },
      { pubkey: ata(so, sell.stockMint, sell.stockTokenProgram), isSigner: false, isWritable: true },
      { pubkey: ata(buy.owner, buy.stockMint, buy.stockTokenProgram), isSigner: false, isWritable: true },
      { pubkey: ata(sell.owner, sell.stableMint, sell.stableTokenProgram), isSigner: false, isWritable: true },
      { pubkey: buy.stockMint, isSigner: false, isWritable: false },
      { pubkey: buy.stableMint, isSigner: false, isWritable: false },
      { pubkey: buy.stockTokenProgram, isSigner: false, isWritable: false },
      { pubkey: buy.stableTokenProgram, isSigner: false, isWritable: false },
    ],
  });
}

export const closePda = (feedIdHex: string) => PublicKey.findProgramAddressSync([Buffer.from("close"), feedBytes(feedIdHex)], GUARD_PROGRAM_ID)[0];

export const crankCloseIx = (payer: PublicKey, feedIdHex: string, priceUpdate: PublicKey) => new TransactionInstruction({
  programId: GUARD_PROGRAM_ID, data: Buffer.concat([disc("crank_close"), feedBytes(feedIdHex)]),
  keys: [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: closePda(feedIdHex), isSigner: false, isWritable: true },
    { pubkey: priceUpdate, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
});

export function crossAtCloseIx(buy: OrderSpec, sell: OrderSpec) {
  const bo = orderPda(buy.owner, buy.nonce), so = orderPda(sell.owner, sell.nonce);
  return new TransactionInstruction({
    programId: GUARD_PROGRAM_ID, data: disc("cross_at_close"),
    keys: [
      { pubkey: closePda(buy.feedIdHex), isSigner: false, isWritable: true },
      { pubkey: bo, isSigner: false, isWritable: true },
      { pubkey: ata(bo, buy.stableMint, buy.stableTokenProgram), isSigner: false, isWritable: true },
      { pubkey: so, isSigner: false, isWritable: true },
      { pubkey: ata(so, sell.stockMint, sell.stockTokenProgram), isSigner: false, isWritable: true },
      { pubkey: ata(buy.owner, buy.stockMint, buy.stockTokenProgram), isSigner: false, isWritable: true },
      { pubkey: ata(sell.owner, sell.stableMint, sell.stableTokenProgram), isSigner: false, isWritable: true },
      { pubkey: buy.stockMint, isSigner: false, isWritable: false },
      { pubkey: buy.stableMint, isSigner: false, isWritable: false },
      { pubkey: buy.stockTokenProgram, isSigner: false, isWritable: false },
      { pubkey: buy.stableTokenProgram, isSigner: false, isWritable: false },
    ],
  });
}

export function decodeClose(data: Buffer) {
  let o = 8 + 32;
  const sessionClose = Number(data.readBigInt64LE(o)); o += 8;
  const priceE6 = data.readBigUInt64LE(o); o += 8;
  const pricePublish = Number(data.readBigInt64LE(o)); o += 8;
  const pairs = data.readUInt32LE(o);
  return { sessionClose, priceE6, pricePublish, pairs };
}

export function cancelOrderIx(o: OrderSpec) {
  const buy = o.side === "buy";
  const inMint = buy ? o.stableMint : o.stockMint;
  const inProg = buy ? o.stableTokenProgram : o.stockTokenProgram;
  const order = orderPda(o.owner, o.nonce);
  return new TransactionInstruction({
    programId: GUARD_PROGRAM_ID, data: disc("cancel_order"),
    keys: [
      { pubkey: o.owner, isSigner: true, isWritable: true },
      { pubkey: order, isSigner: false, isWritable: true },
      { pubkey: ata(order, inMint, inProg), isSigner: false, isWritable: true },
      { pubkey: inMint, isSigner: false, isWritable: false },
      { pubkey: ata(o.owner, inMint, inProg), isSigner: false, isWritable: true },
      { pubkey: inProg, isSigner: false, isWritable: false },
    ],
  });
}

export function decodeOrder(data: Buffer) {
  let o = 8;
  const owner = new PublicKey(data.subarray(o, o + 32)); o += 32;
  const nonce = data.readBigUInt64LE(o); o += 8 + 32 + 32 + 32;
  const side = data[o] === 0 ? "buy" : "sell"; o += 1 + 32;
  const remainingIn = data.readBigUInt64LE(o); o += 8;
  const depositedIn = data.readBigUInt64LE(o); o += 8;
  const receivedOut = data.readBigUInt64LE(o); o += 8;
  const maxGapBps = data.readUInt16LE(o); o += 2;
  const atOpen = data[o] === 1;
  return { owner, nonce, side, remainingIn, depositedIn, receivedOut, maxGapBps, atOpen };
}

export function decodeCross(data: Buffer) {
  let o = 8 + 32;
  const lastPublishSeen = Number(data.readBigInt64LE(o)); o += 8;
  const priceE6 = data.readBigUInt64LE(o); o += 8;
  const openedAt = Number(data.readBigInt64LE(o)); o += 8;
  const windowEnd = Number(data.readBigInt64LE(o)); o += 8;
  const pairs = data.readUInt32LE(o); o += 4 + 16;
  const crosses = data.readUInt32LE(o);
  return { lastPublishSeen, priceE6, openedAt, windowEnd, pairs, crosses };
}

// Jupiter /swap-instructions response, trimmed to what we use.
type JupIx = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string };
export type JupSwapIxs = {
  computeBudgetInstructions: JupIx[]; setupInstructions: JupIx[]; swapInstruction: JupIx;
  cleanupInstruction?: JupIx | null; otherInstructions?: JupIx[]; addressLookupTableAddresses: string[];
};

export const toIx = (i: JupIx) => new TransactionInstruction({
  programId: new PublicKey(i.programId),
  keys: i.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
  data: Buffer.from(i.data, "base64"),
});

export async function buildGuardedSwap(conn: Connection, jup: JupSwapIxs, legs: GuardLegs, policy: Policy, beforeClose: TransactionInstruction[] = []) {
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
    ...beforeClose,
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
  6016: "Circuit breaker: trading paused or in a limit state",
  6017: "The primary exchange has halted this stock",
  6018: "Circuit breaker not cranked recently",
  6019: "Breaker parameters out of range",
  6020: "Breaker is for a different feed",
  6021: "Order waits for a cross",
  6022: "Order expired",
  6023: "No cross is open right now",
  6024: "Orders don't match",
  6025: "Nothing to cross",
  6026: "The zero-knowledge proof did not verify",
};
