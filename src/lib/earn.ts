// Client for the Rehearsal Earn program (onchain/programs/rehearsal_earn): weekly covered
// calls and cash-secured puts on tokenized stocks, settled on the last Pyth price before
// the 16:00 New York close.
import { createHash } from "crypto";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { ata } from "./guard";

export const EARN_PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_EARN_PROGRAM_ID ?? "FDkUBYhiH45BJd4svgHFw8tjSdrYVabcJhenpo81AsjV");
const BPF_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

export const CALL = 0;
export const PUT = 1;
export type Kind = typeof CALL | typeof PUT;

const disc = (name: string) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
const u64 = (v: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(v); return b; };
const i64 = (v: bigint) => { const b = Buffer.alloc(8); b.writeBigInt64LE(v); return b; };
const ro = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: false });
const rw = (pubkey: PublicKey) => ({ pubkey, isSigner: false, isWritable: true });
const signer = (pubkey: PublicKey, isWritable = true) => ({ pubkey, isSigner: true, isWritable });

export const marketPda = (stockMint: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("market"), stockMint.toBuffer()], EARN_PROGRAM_ID)[0];

export type SeriesKey = { stockMint: PublicKey; stableMint: PublicKey; kind: Kind; strikeE6: bigint; expiry: number };

export const seriesPda = (k: SeriesKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("series"), marketPda(k.stockMint).toBuffer(), Buffer.from([k.kind]), u64(k.strikeE6), i64(BigInt(k.expiry)), k.stableMint.toBuffer()],
    EARN_PROGRAM_ID,
  )[0];
export const vaultPda = (series: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("vault"), series.toBuffer()], EARN_PROGRAM_ID)[0];
export const positionPda = (series: PublicKey, owner: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("write"), series.toBuffer(), owner.toBuffer()], EARN_PROGRAM_ID)[0];
export const holdingPda = (series: PublicKey, owner: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("hold"), series.toBuffer(), owner.toBuffer()], EARN_PROGRAM_ID)[0];

/** Token programs for the two legs of a series. */
export type Programs = { stock: PublicKey; stable: PublicKey };
const collateral = (k: SeriesKey, p: Programs) =>
  k.kind === CALL ? { mint: k.stockMint, program: p.stock } : { mint: k.stableMint, program: p.stable };

export function createMarketIx(admin: PublicKey, stockMint: PublicKey, feedIdHex: string) {
  const programData = PublicKey.findProgramAddressSync([EARN_PROGRAM_ID.toBuffer()], BPF_UPGRADEABLE)[0];
  return new TransactionInstruction({
    programId: EARN_PROGRAM_ID,
    keys: [signer(admin), rw(marketPda(stockMint)), ro(stockMint), ro(EARN_PROGRAM_ID), ro(programData), ro(SystemProgram.programId)],
    data: Buffer.concat([disc("create_market"), Buffer.from(feedIdHex.replace(/^0x/, ""), "hex")]),
  });
}

export function createSeriesIx(payer: PublicKey, k: SeriesKey, p: Programs) {
  const series = seriesPda(k);
  const c = collateral(k, p);
  return new TransactionInstruction({
    programId: EARN_PROGRAM_ID,
    keys: [signer(payer), ro(marketPda(k.stockMint)), ro(k.stockMint), ro(k.stableMint), ro(c.mint), rw(series), rw(vaultPda(series)), ro(c.program), ro(SystemProgram.programId)],
    data: Buffer.concat([disc("create_series"), Buffer.from([k.kind]), u64(k.strikeE6), i64(BigInt(k.expiry))]),
  });
}

export function writeOptionsIx(owner: PublicKey, k: SeriesKey, p: Programs, contracts: bigint, askE6: bigint) {
  const series = seriesPda(k);
  const c = collateral(k, p);
  return new TransactionInstruction({
    programId: EARN_PROGRAM_ID,
    keys: [signer(owner), rw(series), rw(positionPda(series, owner)), ro(c.mint), rw(ata(owner, c.mint, c.program)), rw(vaultPda(series)), ro(c.program), ro(SystemProgram.programId)],
    data: Buffer.concat([disc("write_options"), u64(contracts), u64(askE6)]),
  });
}

export function setAskIx(owner: PublicKey, k: SeriesKey, askE6: bigint) {
  return new TransactionInstruction({
    programId: EARN_PROGRAM_ID,
    keys: [signer(owner, false), rw(positionPda(seriesPda(k), owner))],
    data: Buffer.concat([disc("set_ask"), u64(askE6)]),
  });
}

export function unwriteIx(owner: PublicKey, k: SeriesKey, p: Programs, contracts: bigint) {
  const series = seriesPda(k);
  const c = collateral(k, p);
  return new TransactionInstruction({
    programId: EARN_PROGRAM_ID,
    keys: [signer(owner, false), rw(series), rw(positionPda(series, owner)), ro(c.mint), rw(ata(owner, c.mint, c.program)), rw(vaultPda(series)), ro(c.program)],
    data: Buffer.concat([disc("unwrite"), u64(contracts)]),
  });
}

/** Buys from the given writers, cheapest first is up to the caller. */
export function buyIx(buyer: PublicKey, k: SeriesKey, p: Programs, writers: PublicKey[], contracts: bigint, maxAskE6: bigint) {
  const series = seriesPda(k);
  return new TransactionInstruction({
    programId: EARN_PROGRAM_ID,
    keys: [
      signer(buyer), rw(series), rw(holdingPda(series, buyer)), ro(k.stableMint), rw(ata(buyer, k.stableMint, p.stable)), ro(p.stable), ro(SystemProgram.programId),
      ...writers.flatMap((w) => [rw(positionPda(series, w)), rw(ata(w, k.stableMint, p.stable))]),
    ],
    data: Buffer.concat([disc("buy"), u64(contracts), u64(maxAskE6)]),
  });
}

export const snapshotIx = (k: SeriesKey, priceUpdate: PublicKey) => new TransactionInstruction({
  programId: EARN_PROGRAM_ID,
  keys: [rw(seriesPda(k)), ro(k.stockMint), ro(priceUpdate)],
  data: disc("snapshot"),
});

export const finalizeIx = (k: SeriesKey) => new TransactionInstruction({
  programId: EARN_PROGRAM_ID,
  keys: [rw(seriesPda(k))],
  data: disc("finalize"),
});

function claimIx(name: "claim_buyer" | "claim_writer", owner: PublicKey, k: SeriesKey, p: Programs) {
  const series = seriesPda(k);
  const c = collateral(k, p);
  const record = name === "claim_buyer" ? holdingPda(series, owner) : positionPda(series, owner);
  return new TransactionInstruction({
    programId: EARN_PROGRAM_ID,
    keys: [signer(owner), ro(series), rw(record), ro(c.mint), rw(ata(owner, c.mint, c.program)), rw(vaultPda(series)), ro(c.program)],
    data: disc(name),
  });
}
export const claimBuyerIx = (owner: PublicKey, k: SeriesKey, p: Programs) => claimIx("claim_buyer", owner, k, p);
export const claimWriterIx = (owner: PublicKey, k: SeriesKey, p: Programs) => claimIx("claim_writer", owner, k, p);

// ---------------------------------------------------------------- accounts

export type SeriesView = {
  market: PublicKey; stockMint: PublicKey; stableMint: PublicKey; collateralMint: PublicKey; vault: PublicKey;
  feedId: string; kind: Kind; strikeE6: bigint; expiry: number; decimals: number;
  written: bigint; sold: bigint; premiumPaid: bigint;
  snapPriceE6: bigint; snapPublish: number;
  settled: boolean; settlePriceE6: bigint; stale: boolean; voided: boolean;
};

export function decodeSeries(d: Buffer): SeriesView {
  let o = 8;
  const key = () => { const k = new PublicKey(d.subarray(o, o + 32)); o += 32; return k; };
  const big = () => { const v = d.readBigUInt64LE(o); o += 8; return v; };
  const int = () => { const v = Number(d.readBigInt64LE(o)); o += 8; return v; };
  const byte = () => d[o++];
  const market = key(), stockMint = key(), stableMint = key(), collateralMint = key(), vault = key();
  const feedId = d.subarray(o, o + 32).toString("hex"); o += 32;
  const kind = byte() as Kind;
  const strikeE6 = big(), expiry = int(), decimals = byte();
  const written = big(), sold = big(), premiumPaid = big(), snapPriceE6 = big(), snapPublish = int();
  const settled = byte() === 1, settlePriceE6 = big(), stale = byte() === 1, voided = byte() === 1;
  return { market, stockMint, stableMint, collateralMint, vault, feedId, kind, strikeE6, expiry, decimals, written, sold, premiumPaid, snapPriceE6, snapPublish, settled, settlePriceE6, stale, voided };
}

export type PositionView = { series: PublicKey; owner: PublicKey; contracts: bigint; sold: bigint; collateral: bigint; askE6: bigint };
export function decodePosition(d: Buffer): PositionView {
  return {
    series: new PublicKey(d.subarray(8, 40)), owner: new PublicKey(d.subarray(40, 72)),
    contracts: d.readBigUInt64LE(72), sold: d.readBigUInt64LE(80), collateral: d.readBigUInt64LE(88), askE6: d.readBigUInt64LE(96),
  };
}

export type HoldingView = { series: PublicKey; owner: PublicKey; contracts: bigint };
export function decodeHolding(d: Buffer): HoldingView {
  return { series: new PublicKey(d.subarray(8, 40)), owner: new PublicKey(d.subarray(40, 72)), contracts: d.readBigUInt64LE(72) };
}

/** Anchor account discriminators, for getProgramAccounts filters. */
export const ACCOUNT_DISC = {
  series: createHash("sha256").update("account:Series").digest().subarray(0, 8),
  position: createHash("sha256").update("account:Position").digest().subarray(0, 8),
  holding: createHash("sha256").update("account:Holding").digest().subarray(0, 8),
};

// ---------------------------------------------------------------- time

/** Unix seconds of 16:00 New York on a calendar date (handles daylight saving). */
export function nyClose(y: number, m: number, d: number): number {
  const guess = Date.UTC(y, m - 1, d, 20, 0, 0); // 16:00 EDT
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(guess));
  return (guess + (16 - hour) * 3600_000) / 1000;
}

/** The next Friday 16:00 New York close at least `minLeadSecs` away. */
export function nextFridayClose(nowSecs: number, minLeadSecs = 3600): number {
  for (let i = 0; i < 14; i++) {
    const t = new Date((nowSecs + i * 86400) * 1000);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(t);
    const get = (type: string) => parts.find((p) => p.type === type)!.value;
    if (get("weekday") !== "Fri") continue;
    const close = nyClose(Number(get("year")), Number(get("month")), Number(get("day")));
    if (close - nowSecs >= minLeadSecs) return close;
  }
  throw new Error("no Friday close found");
}

export const EARN_ERRORS: Record<number, string> = {
  6000: "Only the program's upgrade authority can list a stock",
  6001: "Series parameters are invalid",
  6002: "Expiry must be a 16:00 New York close on a weekday",
  6003: "Writing and buying close 15 minutes before expiry",
  6004: "Stablecoin is not allowed or doesn't have 6 decimals",
  6005: "Amount must be above zero and within what's available",
  6006: "A transfer fee reduced the collateral",
  6007: "Position or payout account doesn't belong to this series",
  6008: "No writer had contracts at or under your price",
  6009: "Too early for this step",
  6010: "Price was published after the close",
  6011: "No usable closing price yet",
  6012: "Series is already settled",
  6013: "Series is not settled yet",
  6014: "Arithmetic overflow",
};
