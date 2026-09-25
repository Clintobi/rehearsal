// Open execution-quality recorder for tokenized stocks on Solana ("an open Rule 605").
//
// Loops:
//   prices   every 3s   Pyth equity + SOL/USD push accounts → price timeline
//   marks    every 5m   PreStocks marks, Token-2022 multipliers
//   fills    every 30s  new transactions per stock mint → sampled, parsed, graded vs the
//                       reference price at that second (Pyth for xStocks, mark for PreStocks)
//   markouts every 60s  reference price 60s / 300s after each fill
//   report   every 10m  aggregate → data/report.json (+ optional gist upload)
//
// Run:  SOLANA_RPC=... npx tsx scripts/recorder.ts
import { Connection, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import xstocks from "../src/data/xstocks.json";
import { feedAccount, decodePriceUpdate } from "../src/lib/pyth";
import { mintInfos, type MintInfo } from "../src/lib/mintinfo";

const RPC = process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";
const SAMPLE_PER_MINT = Number(process.env.SAMPLE_PER_MINT ?? 4); // fills graded per mint per 30s cycle
const GIST_ID = process.env.REPORT_GIST_ID;
// Below this size, fees, rent and rounding swamp the price, so the fill is recorded but not graded.
const MIN_GRADE_USD = Number(process.env.MIN_GRADE_USD ?? 10);
// Groups smaller than this are published but flagged as too small to read.
const MIN_GROUP = 10; // when set, report.json is pushed to this gist
const conn = new Connection(RPC, "confirmed");

mkdirSync("data", { recursive: true });
const db = new DatabaseSync("data/recorder.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS prices (feed TEXT, ts INTEGER, price REAL, conf REAL, PRIMARY KEY (feed, ts));
  CREATE TABLE IF NOT EXISTS marks (symbol TEXT, ts INTEGER, mark REAL, PRIMARY KEY (symbol, ts));
  CREATE TABLE IF NOT EXISTS fills (
    sig TEXT PRIMARY KEY, mint TEXT, symbol TEXT, kind TEXT, slot INTEGER, block_time INTEGER,
    side TEXT, stock_ui REAL, quote_usd REAL, quote TEXT, fill_price REAL, trader TEXT,
    venue TEXT, router TEXT, ref_price REAL, ref_source TEXT, ref_age INTEGER, gap_bps REAL,
    session TEXT, markout_60 REAL, markout_300 REAL, seen_txs INTEGER
  );
  CREATE TABLE IF NOT EXISTS cursors (mint TEXT PRIMARY KEY, last_sig TEXT, seen INTEGER DEFAULT 0, sampled INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
`);
db.prepare("INSERT OR IGNORE INTO meta VALUES ('started_at', ?)").run(String(Math.floor(Date.now() / 1000)));

// ---------- universe ----------
const STABLES: Record<string, number> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 6, // USDC
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 6, // USDT
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": 6, // PYUSD
};
const WSOL = "So11111111111111111111111111111111111111112";
const SOL_FEED = "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

type Tracked = { symbol: string; mint: string; decimals: number; kind: "xstock" | "prestock"; feed?: string; account?: string };
const tracked: Tracked[] = (xstocks as { symbol: string; mint: string; decimals: number; equity: { id: string; account?: string; shard?: number } | null }[]).map((x) => ({
  symbol: x.symbol, mint: x.mint, decimals: x.decimals, kind: "xstock" as const,
  ...(x.equity?.account && x.equity.shard === 1 ? { feed: x.equity.id, account: feedAccount(x.equity.id, 1).toBase58() } : {}),
}));
const priceAccounts = [...tracked.filter((t) => t.account).map((t) => ({ feed: t.feed!, account: t.account! })), { feed: SOL_FEED, account: feedAccount(SOL_FEED, 1).toBase58() }];

let infos = new Map<string, MintInfo>();
let venueLabels: Record<string, string> = {};
const ROUTERS: Record<string, string> = {
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "Jupiter", JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB: "Jupiter",
  DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH: "DFlow", T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT: "Titan",
  "6m2CDdhRgxpH4WjvdzxAYbGxwdGUz5MziiL5jek2kBma": "OKX",
};
const INFRA = new Set([
  "11111111111111111111111111111111", "ComputeBudget111111111111111111111111111111", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo", "SysvarInstructions1111111111111111111111111",
]);

// ---------- helpers ----------
const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function session(ts: number): string {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date(ts * 1000)).map((x) => [x.type, x.value]));
  const hm = Number(p.hour) * 100 + Number(p.minute);
  const d = p.weekday;
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(d);
  if (weekday && hm >= 930 && hm < 1600) return "regular";
  if (weekday && hm >= 400 && hm < 930) return "pre-market";
  if (weekday && hm >= 1600 && hm < 2000) return "after-hours";
  // Blue Ocean overnight runs Sun–Thu 20:00–04:00 ET
  if ((["Sun", "Mon", "Tue", "Wed", "Thu"].includes(d) && hm >= 2000) || (weekday && hm < 400)) return "overnight";
  return "weekend";
}

const priceAt = db.prepare("SELECT price, ts FROM prices WHERE feed = ? AND ts <= ? ORDER BY ts DESC LIMIT 1");
const markAt = db.prepare("SELECT mark, ts FROM marks WHERE symbol = ? AND ts <= ? ORDER BY ts DESC LIMIT 1");
const markLatest = db.prepare("SELECT mark, ts FROM marks WHERE symbol = ? ORDER BY ts DESC LIMIT 1");

// ---------- loops ----------
async function pricesLoop() {
  const ins = db.prepare("INSERT OR IGNORE INTO prices VALUES (?, ?, ?, ?)");
  const keys = priceAccounts.map((p) => new PublicKey(p.account));
  for (;;) {
    try {
      const accs = await conn.getMultipleAccountsInfo(keys);
      accs.forEach((a, i) => {
        if (!a) return;
        const p = decodePriceUpdate(a.data as Buffer, priceAccounts[i].account);
        ins.run(priceAccounts[i].feed, p.publishTime, p.price, p.conf);
      });
    } catch (e) { console.error("prices", String(e).slice(0, 120)); }
    await sleep(3000);
  }
}

// xStocks issuer reference (via Jupiter price API stockData) for tokens with no on-chain Pyth feed.
async function issuerRefLoop() {
  const ins = db.prepare("INSERT OR IGNORE INTO marks VALUES (?, ?, ?)");
  const noFeed = tracked.filter((t) => t.kind === "xstock" && !t.feed);
  for (;;) {
    try {
      const r = (await (await fetch(`https://lite-api.jup.ag/price/v3?ids=${noFeed.map((t) => t.mint).join(",")}`)).json()) as Record<string, { stockData?: { price: number } }>;
      for (const t of noFeed) { const p = r[t.mint]?.stockData?.price; if (p) ins.run(t.symbol, now(), p); }
    } catch (e) { console.error("issuer", String(e).slice(0, 120)); }
    await sleep(60_000);
  }
}

async function marksLoop() {
  const ins = db.prepare("INSERT OR IGNORE INTO marks VALUES (?, ?, ?)");
  for (;;) {
    try {
      const rows = (await (await fetch("https://prestocks.com/api/prestocks")).json()) as { symbol: string; contract_address: string; markPrice: number }[];
      for (const r of rows) {
        ins.run(r.symbol, now(), r.markPrice);
        if (!tracked.find((t) => t.mint === r.contract_address)) tracked.push({ symbol: r.symbol, mint: r.contract_address, decimals: 9, kind: "prestock" });
      }
      infos = await mintInfos(conn, tracked.map((t) => t.mint));
      if (!Object.keys(venueLabels).length) venueLabels = await (await fetch("https://lite-api.jup.ag/swap/v1/program-id-to-label")).json();
    } catch (e) { console.error("marks", String(e).slice(0, 120)); }
    await sleep(300_000);
  }
}

function parseFill(tx: ParsedTransactionWithMeta, t: Tracked) {
  const meta = tx.meta;
  if (!meta || meta.err || !tx.blockTime) return null;
  const payer = tx.transaction.message.accountKeys[0].pubkey.toBase58();
  const delta = (mint: string) => {
    let pre = 0n, post = 0n;
    for (const b of meta.preTokenBalances ?? []) if (b.mint === mint && b.owner === payer) pre += BigInt(b.uiTokenAmount.amount);
    for (const b of meta.postTokenBalances ?? []) if (b.mint === mint && b.owner === payer) post += BigInt(b.uiTokenAmount.amount);
    return post - pre;
  };
  const stockRaw = delta(t.mint);
  if (stockRaw === 0n) return null;
  const mult = infos.get(t.mint)?.multiplier ?? 1;
  const stockUi = (Number(stockRaw) / 10 ** t.decimals) * mult;

  // Quote leg: a stablecoin, else SOL (native + wSOL) valued at Pyth SOL/USD.
  let quoteUsd = 0, quote = "";
  for (const [m, d] of Object.entries(STABLES)) {
    const q = delta(m);
    if (q !== 0n) { quoteUsd = Number(q) / 10 ** d; quote = m === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" ? "USDC" : m.startsWith("Es9v") ? "USDT" : "PYUSD"; break; }
  }
  if (!quote) {
    const lamports = (meta.postBalances[0] - meta.preBalances[0] + meta.fee) + Number(delta(WSOL));
    if (Math.abs(lamports) < 5_000_000) return null; // < 0.005 SOL: not a swap leg
    const sol = priceAt.get(SOL_FEED, tx.blockTime) as { price: number } | undefined;
    if (!sol) return null;
    quoteUsd = (lamports / 1e9) * sol.price; quote = "SOL";
  }
  // Opposite signs: stock in / quote out = buy; stock out / quote in = sell.
  if (Math.sign(Number(stockRaw)) === Math.sign(quoteUsd)) return null;
  const side = stockRaw > 0n ? "buy" : "sell";
  const fillPrice = Math.abs(quoteUsd) / Math.abs(stockUi);

  const programs = new Set<string>();
  for (const l of meta.logMessages ?? []) { const m = l.match(/^Program (\w+) invoke/); if (m) programs.add(m[1]); }
  const router = [...programs].map((p) => ROUTERS[p]).find(Boolean) ?? "direct";
  const amms = [...programs].filter((p) => !INFRA.has(p) && !ROUTERS[p]).map((p) => venueLabels[p]).filter(Boolean);
  const venue = [...new Set(amms)].slice(0, 2).join(" + ") || "unknown";

  let ref: { price: number; ts: number } | undefined, refSource = "";
  if (t.feed) {
    ref = priceAt.get(t.feed, tx.blockTime) as { price: number; ts: number } | undefined;
    refSource = "pyth";
  } else {
    const m = (markAt.get(t.symbol, tx.blockTime) ?? markLatest.get(t.symbol)) as { mark: number; ts: number } | undefined;
    if (m) ref = { price: m.mark, ts: m.ts };
    refSource = t.kind === "prestock" ? "mark" : "xstocks-ref";
  }
  const refAge = ref ? tx.blockTime - ref.ts : null;
  const maxAge = refSource === "pyth" ? 120 : refSource === "xstocks-ref" ? 300 : Infinity;
  // SOL legs carry rent refunds and tips; below $100 that noise swamps the price.
  const reliableQuote = (quote !== "SOL" || Math.abs(quoteUsd) >= 100) && Math.abs(quoteUsd) >= MIN_GRADE_USD;
  let usable = !!ref && (refAge ?? Infinity) <= maxAge && reliableQuote;
  let gap = usable ? (side === "buy" ? fillPrice / ref!.price - 1 : 1 - fillPrice / ref!.price) * 10_000 : null;
  // Multi-leg transactions (several outputs from one input) don't parse to a single fill price.
  if (gap != null && Math.abs(gap) > 3000) { usable = false; gap = null; refSource = "unparsed"; }
  return {
    sig: tx.transaction.signatures[0], mint: t.mint, symbol: t.symbol, kind: t.kind, slot: tx.slot, block_time: tx.blockTime,
    side, stock_ui: Math.abs(stockUi), quote_usd: Math.abs(quoteUsd), quote, fill_price: fillPrice, trader: payer,
    venue, router, ref_price: usable ? ref!.price : null, ref_source: usable ? refSource : refSource === "unparsed" ? "unparsed" : null, ref_age: refAge, gap_bps: gap,
    session: session(tx.blockTime),
  };
}

async function fillsLoop() {
  const insFill = db.prepare(`INSERT OR IGNORE INTO fills (sig, mint, symbol, kind, slot, block_time, side, stock_ui, quote_usd, quote, fill_price, trader, venue, router, ref_price, ref_source, ref_age, gap_bps, session)
    VALUES (:sig, :mint, :symbol, :kind, :slot, :block_time, :side, :stock_ui, :quote_usd, :quote, :fill_price, :trader, :venue, :router, :ref_price, :ref_source, :ref_age, :gap_bps, :session)`);
  const getCur = db.prepare("SELECT last_sig FROM cursors WHERE mint = ?");
  const setCur = db.prepare("INSERT INTO cursors (mint, last_sig, seen, sampled) VALUES (?, ?, ?, ?) ON CONFLICT(mint) DO UPDATE SET last_sig = excluded.last_sig, seen = seen + excluded.seen, sampled = sampled + excluded.sampled");
  while (!infos.size) await sleep(1000);
  for (;;) {
    const started = Date.now();
    for (const t of tracked) {
      try {
        const cur = getCur.get(t.mint) as { last_sig: string } | undefined;
        const sigs = (await conn.getSignaturesForAddress(new PublicKey(t.mint), { limit: 1000, ...(cur ? { until: cur.last_sig } : {}) })).filter((s) => !s.err);
        if (!sigs.length) continue;
        if (!cur) { setCur.run(t.mint, sigs[0].signature, 0, 0); continue; } // first pass just sets the cursor
        const pick = [...sigs].sort(() => Math.random() - 0.5).slice(0, SAMPLE_PER_MINT);
        let graded = 0;
        for (const s of pick) {
          const tx = await conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 }).catch(() => null);
          const f = tx && parseFill(tx, t);
          if (f) { insFill.run(f as never); graded++; }
        }
        setCur.run(t.mint, sigs[0].signature, sigs.length, pick.length);
        if (graded) console.log(`${new Date().toISOString().slice(11, 19)} ${t.symbol.padEnd(10)} +${graded} fills (of ${sigs.length} txs)`);
      } catch (e) { console.error("fills", t.symbol, String(e).slice(0, 120)); }
    }
    await sleep(Math.max(0, 30_000 - (Date.now() - started)));
  }
}

async function markoutsLoop() {
  const due = db.prepare("SELECT sig, mint, symbol, side, fill_price, block_time FROM fills WHERE kind = 'xstock' AND ref_price IS NOT NULL AND markout_300 IS NULL AND block_time <= ?");
  const upd = db.prepare("UPDATE fills SET markout_60 = ?, markout_300 = ? WHERE sig = ?");
  for (;;) {
    for (const f of due.all(now() - 320) as { sig: string; mint: string; side: string; fill_price: number; block_time: number }[]) {
      const t = tracked.find((x) => x.mint === f.mint);
      if (!t?.feed) continue;
      const at = (dt: number) => (priceAt.get(t.feed!, f.block_time + dt) as { price: number } | undefined)?.price;
      const m = (p: number | undefined) => (p == null ? null : (f.side === "buy" ? p / f.fill_price - 1 : 1 - p / f.fill_price) * 10_000);
      upd.run(m(at(60)), m(at(300)) ?? -99999, f.sig);
    }
    await sleep(60_000);
  }
}

// ---------- report ----------
function pct(arr: number[], q: number) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
}
function summarize(rows: { gap_bps: number | null; quote_usd: number; markout_300: number | null }[]) {
  const gradeable = rows.filter((r) => r.quote_usd >= MIN_GRADE_USD);
  const g = gradeable.map((r) => r.gap_bps).filter((x): x is number => x != null);
  const m = gradeable.map((r) => r.markout_300).filter((x): x is number => x != null && x > -99999);
  return {
    fills: rows.length, graded: g.length, enough: g.length >= MIN_GROUP, volume_usd: Math.round(rows.reduce((s, r) => s + r.quote_usd, 0)),
    median_gap_bps: pct(g, 0.5), p90_gap_bps: pct(g, 0.9),
    within_25bps: g.length ? g.filter((x) => x <= 25).length / g.length : null,
    within_100bps: g.length ? g.filter((x) => x <= 100).length / g.length : null,
    median_markout_5m_bps: pct(m, 0.5),
  };
}
const BUCKETS: [string, number, number][] = [["< $100", 0, 100], ["$100–1k", 100, 1000], ["$1k–10k", 1000, 10_000], ["$10k+", 10_000, Infinity]];

// Tamper-evident commitment: the exact graded-fill dataset behind the report is published,
// and its sha256 is written to Solana (devnet) in a memo. Anyone can download the dataset,
// check the hash on-chain, and recompute every number (node zk/verify-offchain.mjs).
const COMMIT_RPC = process.env.COMMIT_RPC; // e.g. a devnet RPC
const COMMIT_KEY = process.env.COMMIT_KEY ?? "onchain/keys/deployer.json";
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

function exportFills(exclude: Set<string> = new Set()) {
  const rows = (db.prepare("SELECT sig, symbol, kind, block_time, side, quote_usd, fill_price, ref_price, ref_source FROM fills WHERE gap_bps IS NOT NULL AND quote_usd >= ? ORDER BY block_time, sig").all(MIN_GRADE_USD) as { sig: string; symbol: string; kind: string; block_time: number; side: string; quote_usd: number; fill_price: number; ref_price: number; ref_source: string }[])
    .filter((r) => !exclude.has(r.sig));
  const out = rows.map((r) => ({ sig: r.sig, symbol: r.symbol, kind: r.kind, t: r.block_time, side: r.side, usd_e6: Math.round(r.quote_usd * 1e6), fill_e6: Math.round(r.fill_price * 1e6), ref_e6: Math.round(r.ref_price * 1e6), ref: r.ref_source }));
  const bytes = Buffer.from(JSON.stringify(out));
  writeFileSync("data/fills.json", bytes);
  // Same integer math as zk/program and zk/verify-offchain.mjs, so the committed numbers
  // are exactly what anyone recomputes from the published dataset.
  const gap = (f: (typeof out)[number]) => { const a = BigInt(f.fill_e6), r = BigInt(f.ref_e6); return Number(f.side === "buy" ? (a - r) * 10000n / r : (r - a) * 10000n / r); };
  const median = (kind: string) => { const g = out.filter((f) => f.kind === kind).map(gap).sort((x, y) => x - y); return g.length ? g[Math.floor((g.length - 1) / 2)] : null; };
  return { count: out.length, sha256: createHash("sha256").update(bytes).digest("hex"), xstockMedian: median("xstock"), prestockMedian: median("prestock") };
}

async function commitOnChain(memo: string) {
  if (!COMMIT_RPC || !existsSync(COMMIT_KEY)) return null;
  const c = new Connection(COMMIT_RPC, "confirmed");
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(COMMIT_KEY, "utf8"))));
  const { blockhash } = await c.getLatestBlockhash();
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: [new TransactionInstruction({ programId: MEMO, keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }], data: Buffer.from(memo) })] }).compileToV0Message());
  tx.sign([payer]);
  const sig = await c.sendRawTransaction(tx.serialize());
  await c.confirmTransaction(sig, "confirmed");
  return sig;
}

// Wash-trading filter, after the DN Institute study of Solana xStock pools: a wallet that buys and
// sells the same token at least 5 times each and ends within 10% of flat is round-tripping, not
// investing. Its fills are excluded from every statistic and from the published dataset.
const BOT_MIN_EACH = 5, BOT_FLAT = 0.1;
function roundTrippers(rows: { trader: string | null; mint: string; side: string; quote_usd: number }[]) {
  const m = new Map<string, { b: number; s: number; bu: number; su: number }>();
  for (const r of rows) {
    if (!r.trader) continue;
    const k = `${r.trader}|${r.mint}`, x = m.get(k) ?? { b: 0, s: 0, bu: 0, su: 0 };
    if (r.side === "buy") { x.b++; x.bu += r.quote_usd; } else { x.s++; x.su += r.quote_usd; }
    m.set(k, x);
  }
  return new Set([...m.entries()].filter(([, v]) => v.b >= BOT_MIN_EACH && v.s >= BOT_MIN_EACH && Math.abs(v.bu - v.su) <= BOT_FLAT * Math.max(v.bu, v.su)).map(([k]) => k));
}

async function report() {
  const every = db.prepare("SELECT * FROM fills").all() as Record<string, never>[] as unknown as {
    sig: string; symbol: string; mint: string; trader: string | null; kind: string; side: string; venue: string; router: string; session: string; quote_usd: number;
    fill_price: number; ref_price: number | null; ref_source: string | null; gap_bps: number | null; markout_300: number | null; block_time: number;
  }[];
  const bots = roundTrippers(every);
  const isBot = (r: (typeof every)[number]) => !!r.trader && bots.has(`${r.trader}|${r.mint}`);
  const all = every.filter((r) => !isBot(r));
  const botFills = every.filter(isBot);
  const group = (key: (r: (typeof all)[number]) => string, min = 1) => {
    const m = new Map<string, typeof all>();
    for (const r of all) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return [...m.entries()].filter(([, v]) => v.length >= min).map(([k, v]) => ({ key: k, ...summarize(v) })).sort((a, b) => b.volume_usd - a.volume_usd);
  };
  const cursors = db.prepare("SELECT SUM(seen) seen, SUM(sampled) sampled FROM cursors").get() as { seen: number; sampled: number };
  const started = Number((db.prepare("SELECT v FROM meta WHERE k = 'started_at'").get() as { v: string }).v);
  const worst = all.filter((r) => r.gap_bps != null && r.quote_usd >= 50).sort((a, b) => b.gap_bps! - a.gap_bps!).slice(0, 12)
    .map((r) => ({ sig: r.sig, symbol: r.symbol, side: r.side, usd: Math.round(r.quote_usd), fill: r.fill_price, ref: r.ref_price, ref_source: r.ref_source, gap_bps: Math.round(r.gap_bps!), venue: r.venue, router: r.router, t: r.block_time }));
  const out = {
    generated_at: now(), started_at: started, min_group: MIN_GROUP, min_grade_usd: MIN_GRADE_USD,
    method: {
      sampling: `Up to ${SAMPLE_PER_MINT} successful transactions per token every 30s, chosen at random from every transaction touching the mint.`,
      reference: "xStocks with an on-chain Pyth feed: Pyth Equity.US price account at the fill's block time (≤120s old). Other xStocks: the issuer's reference price via Jupiter (≤5 min old), a weaker reference. PreStocks: issuer mark at the fill's block time.",
    exclusions: `Fills under $${10} (fees and rounding swamp the price), SOL-paid fills under $100 (rent refunds and tips distort them) and multi-leg transactions more than 30% from the reference are recorded but not graded. Groups with fewer than ${10} graded fills are shown as too small to read.`,
      gap: "Positive = worse than the reference for the trader (buy: fill/ref − 1, sell: 1 − fill/ref). Fill price is net of Token-2022 transfer fees and uses the scaled-UI multiplier.",
      markout: "Reference price 5 minutes after the fill vs the fill price, from the trader's side.",
      bots: `Excluded: wallets that buy and sell the same token at least ${BOT_MIN_EACH} times each and end within ${BOT_FLAT * 100}% of flat (the wash-trading signature from the DN Institute's study of Solana xStock pools). Their fills are dropped from every number and from the published dataset.`,
    },
    coverage: { txs_seen: cursors.seen ?? 0, txs_sampled: cursors.sampled ?? 0, fills: all.length, bot_fills_excluded: botFills.length, bot_wallet_tokens: bots.size },
    overall: { xstocks: summarize(all.filter((r) => r.kind === "xstock")), prestocks: summarize(all.filter((r) => r.kind === "prestock")) },
    by_reference: group((r) => r.ref_source ?? "ungraded"),
    by_venue: group((r) => r.venue, 3), by_router: group((r) => r.router, 3),
    by_token: group((r) => r.symbol), by_session: group((r) => `${r.kind}:${r.session}`),
    by_size: BUCKETS.map(([name, lo, hi]) => ({ key: name, ...summarize(all.filter((r) => r.quote_usd >= lo && r.quote_usd < hi)) })),
    worst_fills: worst,
  };
  const ds = exportFills(new Set(botFills.map((r) => r.sig)));
  writeScorecards(every, bots);
  const memo = `rehearsal-report v1 fills=${ds.count} sha256=${ds.sha256} xstock_median_bps=${ds.xstockMedian} prestock_median_bps=${ds.prestockMedian} at=${out.generated_at}`;
  const sig = await commitOnChain(memo).catch((e) => { console.error("commit", String(e).slice(0, 120)); return null; });
  const withCommit = { ...out, dataset: { fills: ds.count, sha256: ds.sha256, memo, commitment_tx: sig, cluster: "devnet" } };
  writeFileSync("data/report.json", JSON.stringify(withCommit));
  if (GIST_ID) {
    for (const f of ["report.json", "fills.json", "scorecards.json"]) {
      try { execFileSync("gh", ["gist", "edit", GIST_ID, "-a", `data/${f}`]); } catch { try { execFileSync("gh", ["gist", "edit", GIST_ID, "-f", f, `data/${f}`]); } catch (e) { console.error("gist", f, String(e).slice(0, 120)); } }
    }
  }
  console.log(`report: ${all.length} fills, ${out.overall.xstocks.graded} xStock + ${out.overall.prestocks.graded} PreStocks graded, dataset ${ds.sha256.slice(0, 12)}… committed ${sig ?? "(no commit)"}`);
}

// Per-wallet scorecards from the sampled fills, for auditing agents and bots (MCP agent_scorecard).
function writeScorecards(rows: { trader: string | null; mint: string; symbol: string; kind: string; quote_usd: number; gap_bps: number | null; markout_300: number | null; block_time: number }[], bots: Set<string>) {
  const by = new Map<string, typeof rows>();
  for (const r of rows) if (r.trader) by.set(r.trader, [...(by.get(r.trader) ?? []), r]);
  const wallets = [...by.entries()].map(([wallet, rs]) => {
    const s = summarize(rs);
    const tokens = [...new Set(rs.map((r) => r.symbol))];
    return {
      wallet, fills: rs.length, graded: s.graded, volume_usd: s.volume_usd,
      median_gap_bps: s.median_gap_bps, p90_gap_bps: s.p90_gap_bps, within_25bps: s.within_25bps, median_markout_5m_bps: s.median_markout_5m_bps,
      tokens: tokens.slice(0, 8), first: Math.min(...rs.map((r) => r.block_time)), last: Math.max(...rs.map((r) => r.block_time)),
      bot: rs.some((r) => bots.has(`${r.trader}|${r.mint}`)),
    };
  }).filter((w) => w.graded >= 3).sort((a, b) => b.fills - a.fills).slice(0, 1000);
  writeFileSync("data/scorecards.json", JSON.stringify({
    generated_at: now(), wallets,
    method: "Sampled fills graded against fair value (see report.json method). median_gap_bps > 0 means worse than fair. Markout: reference 5 minutes later vs the fill. bot = round-trips a token (the report excludes those fills).",
  }));
}

async function reportLoop() { for (;;) { await sleep(600_000); try { await report(); } catch (e) { console.error("report", e); } } }

if (process.argv.includes("--report")) { report().then(() => process.exit(0)); }
if (!process.argv.includes("--report")) {
console.log(`recorder: ${tracked.length} xStocks + PreStocks, ${priceAccounts.length} Pyth accounts, RPC ${RPC.replace(/api-key=.*/, "api-key=…")}`);
pricesLoop(); marksLoop(); issuerRefLoop(); fillsLoop(); markoutsLoop(); reportLoop();
}
