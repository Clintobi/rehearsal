// Server side of Earn: reads series, asks and positions from the chain, and builds the
// transactions a wallet signs. Prices come from the same on-chain Pyth accounts the program
// settles on.
import {
  ComputeBudgetProgram, Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import xstocks from "@/data/xstocks.json";
import { mintInfos } from "./mintinfo";
import { decodePriceUpdate, feedAccount } from "./pyth";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM, ata } from "./guard";
import {
  ACCOUNT_DISC, CALL, EARN_PROGRAM_ID, PUT, buyIx, claimBuyerIx, claimWriterIx, createSeriesIx, decodeHolding, decodePosition,
  decodeSeries, finalizeIx, holdingPda, nextFridayClose, positionPda, seriesPda, snapshotIx, unwriteIx, writeOptionsIx,
  type Kind, type SeriesKey,
} from "./earn";

export const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const PROGRAMS = { stock: TOKEN_2022_PROGRAM, stable: TOKEN_PROGRAM };
const FINALIZE_DELAY = 15 * 60;

// Stocks with weekly series, and the volatility used for the suggested premium only.
const LISTED: { symbol: string; vol: number }[] = [
  { symbol: "NVDAx", vol: 0.45 },
  { symbol: "TSLAx", vol: 0.55 },
  { symbol: "SPYx", vol: 0.15 },
];
type Row = { symbol: string; ticker: string; name: string; mint: string; decimals: number; icon: string; equity: { id: string } };
export const EARN_STOCKS = LISTED.map((l) => {
  const r = (xstocks as unknown as Row[]).find((x) => x.symbol === l.symbol)!;
  return { ...l, ticker: r.ticker, name: r.name, mint: new PublicKey(r.mint), decimals: r.decimals, icon: r.icon, feed: r.equity.id };
});
export const stockBySymbol = (s: string) => EARN_STOCKS.find((x) => x.symbol === s);

// ---------------------------------------------------------------- pricing (suggestion only)

function normCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
/** Black-Scholes value per share, no rates or dividends. */
export function bs(kind: Kind, spot: number, strike: number, vol: number, years: number) {
  if (years <= 0) return Math.max(0, kind === CALL ? spot - strike : strike - spot);
  const s = vol * Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (s * s) / 2) / s;
  const d2 = d1 - s;
  return kind === CALL ? spot * normCdf(d1) - strike * normCdf(d2) : strike * normCdf(-d2) - spot * normCdf(-d1);
}

/** Round share strikes: $1 steps above $50, $0.50 below. */
function strikesAround(share: number) {
  const step = share >= 50 ? 1 : 0.5;
  const r = (x: number) => Math.round(x / step) * step;
  return {
    put: [0.97, 0.95, 0.9].map((f) => r(share * f)),
    call: [1.03, 1.05, 1.1].map((f) => r(share * f)),
  };
}

// ---------------------------------------------------------------- board

export type Ask = { owner: string; available: string; askE6: string };
export type SeriesOut = {
  key: string; symbol: string; kind: "call" | "put"; strikeE6: string; shareStrike: number; expiry: number;
  written: string; sold: string; premiumPaid: string; asks: Ask[]; bestAskE6: string | null;
  settled: boolean; settlePriceE6: string; stale: boolean; voided: boolean; snapPublish: number;
};
export type EarnBoard = {
  live: boolean; now: number; expiry: number;
  stocks: { symbol: string; ticker: string; name: string; icon: string; mint: string; share: number; multiplier: number; token: number; priceTime: number; vol: number;
    strikes: { put: number[]; call: number[] }; suggest: { kind: "call" | "put"; shareStrike: number; askPerShare: number }[] }[];
  series: SeriesOut[];
  positions: { series: string; contracts: string; sold: string; collateral: string; askE6: string }[];
  holdings: { series: string; contracts: string }[];
};

export async function earnBoard(conn: Connection, wallet?: PublicKey): Promise<EarnBoard> {
  const prog = await conn.getAccountInfo(EARN_PROGRAM_ID);
  const nowSecs = Math.floor(Date.now() / 1000);
  const slotTime = await conn.getBlockTime(await conn.getSlot()).catch(() => null);
  const now = slotTime ?? nowSecs; // a practice fork's clock can differ from the wall clock
  // Roll to the next week once this Friday is under 2 days away, as weekly products do.
  const expiry = nextFridayClose(now, 2 * 86400);
  const infos = await mintInfos(conn, EARN_STOCKS.map((s) => s.mint.toBase58()));
  const priceAccts = await conn.getMultipleAccountsInfo(EARN_STOCKS.map((s) => feedAccount(s.feed, 1)));
  const years = Math.max(expiry - now, 3600) / (365 * 86400);

  const stocks = EARN_STOCKS.map((s, i) => {
    const p = priceAccts[i] ? decodePriceUpdate(priceAccts[i]!.data as Buffer, "") : null;
    const multiplier = infos.get(s.mint.toBase58())?.multiplier ?? 1;
    const share = p?.price ?? 0;
    const strikes = strikesAround(share);
    const suggest = [
      ...strikes.put.map((k) => ({ kind: "put" as const, shareStrike: k, askPerShare: +bs(PUT, share, k, s.vol, years).toFixed(2) })),
      ...strikes.call.map((k) => ({ kind: "call" as const, shareStrike: k, askPerShare: +bs(CALL, share, k, s.vol, years).toFixed(2) })),
    ];
    return { symbol: s.symbol, ticker: s.ticker, name: s.name, icon: s.icon, mint: s.mint.toBase58(), share, multiplier, token: share * multiplier, priceTime: p?.publishTime ?? 0, vol: s.vol, strikes, suggest };
  });

  if (!prog?.executable) return { live: false, now, expiry, stocks, series: [], positions: [], holdings: [] };

  const [seriesAccts, posAccts] = await Promise.all([
    conn.getProgramAccounts(EARN_PROGRAM_ID, { filters: [{ memcmp: { offset: 0, bytes: bs58(ACCOUNT_DISC.series) } }] }),
    conn.getProgramAccounts(EARN_PROGRAM_ID, { filters: [{ memcmp: { offset: 0, bytes: bs58(ACCOUNT_DISC.position) } }] }),
  ]);
  const positions = posAccts.map((a) => ({ key: a.pubkey, ...decodePosition(a.account.data as Buffer) }));
  const series: SeriesOut[] = [];
  for (const a of seriesAccts) {
    const v = decodeSeries(a.account.data as Buffer);
    const stock = stocks.find((s) => s.mint === v.stockMint.toBase58());
    if (!stock || v.expiry < now - 14 * 86400) continue;
    const asks = positions
      .filter((p) => p.series.equals(a.pubkey) && p.contracts > p.sold)
      .map((p) => ({ owner: p.owner.toBase58(), available: (p.contracts - p.sold).toString(), askE6: p.askE6.toString() }))
      .sort((x, y) => Number(BigInt(x.askE6) - BigInt(y.askE6)));
    series.push({
      key: a.pubkey.toBase58(), symbol: stock.symbol, kind: v.kind === CALL ? "call" : "put", strikeE6: v.strikeE6.toString(),
      shareStrike: +(Number(v.strikeE6) / 1e6 / stock.multiplier).toFixed(2), expiry: v.expiry,
      written: v.written.toString(), sold: v.sold.toString(), premiumPaid: v.premiumPaid.toString(), asks, bestAskE6: asks[0]?.askE6 ?? null,
      settled: v.settled, settlePriceE6: v.settlePriceE6.toString(), stale: v.stale, voided: v.voided, snapPublish: v.snapPublish,
    });
  }
  series.sort((x, y) => x.expiry - y.expiry || x.symbol.localeCompare(y.symbol) || Number(BigInt(x.strikeE6) - BigInt(y.strikeE6)));

  let mine: EarnBoard["positions"] = [];
  let holdings: EarnBoard["holdings"] = [];
  if (wallet) {
    mine = positions.filter((p) => p.owner.equals(wallet)).map((p) => ({ series: p.series.toBase58(), contracts: p.contracts.toString(), sold: p.sold.toString(), collateral: p.collateral.toString(), askE6: p.askE6.toString() }));
    const h = await conn.getProgramAccounts(EARN_PROGRAM_ID, { filters: [{ memcmp: { offset: 0, bytes: bs58(ACCOUNT_DISC.holding) } }, { memcmp: { offset: 40, bytes: wallet.toBase58() } }] });
    holdings = h.map((a) => decodeHolding(a.account.data as Buffer)).map((x) => ({ series: x.series.toBase58(), contracts: x.contracts.toString() }));
  }
  return { live: true, now, expiry, stocks, series, positions: mine, holdings };
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58(buf: Buffer) {
  let n = BigInt("0x" + buf.toString("hex"));
  let out = "";
  while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  for (const b of buf) { if (b === 0) out = "1" + out; else break; }
  return out;
}

// ---------------------------------------------------------------- transactions

export type EarnAction =
  | { action: "write"; symbol: string; kind: "call" | "put"; strikeE6: string; expiry: number; contracts: string; askE6: string }
  | { action: "buy"; series: string; contracts: string; maxAskE6: string }
  | { action: "unwrite"; series: string; contracts: string }
  | { action: "claim"; series: string; as: "writer" | "buyer" };

async function keyOf(conn: Connection, series: PublicKey): Promise<{ k: SeriesKey; v: ReturnType<typeof decodeSeries> }> {
  const a = await conn.getAccountInfo(series);
  if (!a) throw new Error("Series not found");
  const v = decodeSeries(a.data as Buffer);
  return { k: { stockMint: v.stockMint, stableMint: v.stableMint, kind: v.kind, strikeE6: v.strikeE6, expiry: v.expiry }, v };
}

export async function buildEarnTx(conn: Connection, wallet: PublicKey, a: EarnAction) {
  const ixs: TransactionInstruction[] = [];
  if (a.action === "write") {
    const stock = stockBySymbol(a.symbol);
    if (!stock) throw new Error("This stock has no weekly series");
    const k: SeriesKey = { stockMint: stock.mint, stableMint: USDC, kind: a.kind === "call" ? CALL : PUT, strikeE6: BigInt(a.strikeE6), expiry: a.expiry };
    // Premiums are paid in USDC, so the writer needs a USDC account even when escrowing stock.
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(wallet, ata(wallet, USDC, TOKEN_PROGRAM), wallet, USDC, TOKEN_PROGRAM));
    if (!(await conn.getAccountInfo(seriesPda(k)))) ixs.push(createSeriesIx(wallet, k, PROGRAMS));
    ixs.push(writeOptionsIx(wallet, k, PROGRAMS, BigInt(a.contracts), BigInt(a.askE6)));
  } else if (a.action === "buy") {
    const series = new PublicKey(a.series);
    const { k } = await keyOf(conn, series);
    const max = BigInt(a.maxAskE6);
    const pos = await conn.getProgramAccounts(EARN_PROGRAM_ID, { filters: [{ memcmp: { offset: 0, bytes: bs58(ACCOUNT_DISC.position) } }, { memcmp: { offset: 8, bytes: series.toBase58() } }] });
    const writers = pos.map((p) => decodePosition(p.account.data as Buffer))
      .filter((p) => p.contracts > p.sold && p.askE6 <= max && !p.owner.equals(wallet))
      .sort((x, y) => Number(x.askE6 - y.askE6));
    let need = BigInt(a.contracts);
    const picked: PublicKey[] = [];
    for (const w of writers) { if (need <= 0n || picked.length >= 6) break; picked.push(w.owner); need -= w.contracts - w.sold; }
    if (!picked.length) throw new Error("Nobody is offering this at or under your price right now");
    ixs.push(buyIx(wallet, k, PROGRAMS, picked, BigInt(a.contracts), max));
  } else if (a.action === "unwrite") {
    const { k } = await keyOf(conn, new PublicKey(a.series));
    ixs.push(unwriteIx(wallet, k, PROGRAMS, BigInt(a.contracts)));
  } else {
    const series = new PublicKey(a.series);
    const { k, v } = await keyOf(conn, series);
    const now = (await conn.getBlockTime(await conn.getSlot())) ?? Math.floor(Date.now() / 1000);
    if (!v.settled) {
      if (now < v.expiry + FINALIZE_DELAY) throw new Error("This week's price is fixed 15 minutes after Friday's 4:00 PM close");
      // Bring the settlement along if nobody has cranked it yet.
      const stock = EARN_STOCKS.find((s) => s.mint.equals(v.stockMint))!;
      const priceAcct = feedAccount(stock.feed, 1);
      const pa = await conn.getAccountInfo(priceAcct);
      const p = pa ? decodePriceUpdate(pa.data as Buffer, "") : null;
      if (p && p.publishTime <= v.expiry && p.publishTime > v.snapPublish) ixs.push(snapshotIx(k, priceAcct));
      ixs.push(finalizeIx(k));
    }
    const collateral = k.kind === CALL ? { mint: k.stockMint, program: PROGRAMS.stock } : { mint: USDC, program: PROGRAMS.stable };
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(wallet, ata(wallet, collateral.mint, collateral.program), wallet, collateral.mint, collateral.program));
    const record = a.as === "writer" ? positionPda(series, wallet) : holdingPda(series, wallet);
    if (!(await conn.getAccountInfo(record))) throw new Error(a.as === "writer" ? "You have nothing written in this series" : "You hold nothing in this series");
    ixs.push(a.as === "writer" ? claimWriterIx(wallet, k, PROGRAMS) : claimBuyerIx(wallet, k, PROGRAMS));
  }
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({ payerKey: wallet, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...ixs] }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  return { transaction: Buffer.from(tx.serialize()).toString("base64"), lastValidBlockHeight };
}
