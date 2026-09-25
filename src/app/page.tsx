"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import type { Rehearsal } from "@/lib/rehearse";
import type { BoardRow } from "@/app/api/board/route";

const WalletMultiButton = dynamic(() => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton), { ssr: false });

type AssetOpt = { symbol: string; name: string; mint: string; kind: "xstock" | "prestock"; icon?: string; ref: string | null };

const GUARD_LIVE = process.env.NEXT_PUBLIC_GUARD_LIVE === "1";
const GUARD_DEVNET = process.env.NEXT_PUBLIC_GUARD_DEVNET === "1";
const GUARD_ID = process.env.NEXT_PUBLIC_GUARD_PROGRAM_ID ?? "TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE";
const usdFmt = (n: number, d = 2) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n: number | null | undefined, d = 2) => (n == null ? "–" : `${n > 0 ? "+" : ""}${n.toFixed(d)}%`);
const b64ToBytes = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const bytesToB64 = (u: Uint8Array) => btoa(Array.from(u, (c) => String.fromCharCode(c)).join(""));
const bil = (v: number) => (v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : `$${(v / 1e9).toFixed(0)}B`);
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

const tone = {
  good: "bg-good-bg text-good border-good/20",
  warn: "bg-warn-bg text-warn border-warn/20",
  bad: "bg-bad-bg text-bad border-bad/20",
  unknown: "bg-paper text-mute border-line",
} as const;

function gapTone(p: number | null, kind: string) {
  if (p == null) return "text-mute";
  const a = Math.abs(p);
  const [w, b] = kind === "prestock" ? [5, 15] : [0.75, 3];
  return a >= b ? "text-bad" : a >= w ? "text-warn" : "text-good";
}

export default function Home() {
  const [assets, setAssets] = useState<AssetOpt[]>([]);
  const [mint, setMint] = useState("");
  const [usd, setUsd] = useState("1000");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [result, setResult] = useState<Rehearsal | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState<{ rows: BoardRow[]; at: number; probeUsd: number } | null>(null);

  useEffect(() => {
    fetch("/api/assets").then((r) => r.json()).then((a: AssetOpt[]) => {
      setAssets(a);
      const q = new URLSearchParams(location.search).get("t") ?? location.pathname.match(/^\/rehearse\/([^/]+)/)?.[1];
      setMint((a.find((x) => x.symbol.toLowerCase() === q?.toLowerCase()) ?? a.find((x) => x.symbol === "OPENAI") ?? a[0]).mint);
    });
    const load = () => fetch("/api/board").then((r) => r.json()).then(setBoard).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const asset = assets.find((a) => a.mint === mint);

  const run = useCallback(async (m = mint, s = side) => {
    if (!m || !(Number(usd) > 0)) return;
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/rehearse?mint=${m}&usd=${Number(usd)}&side=${s}`);
      const j = await r.json();
      if (j.error) { setErr(j.error); setResult(null); } else setResult(j);
    } catch { setErr("Could not reach the quote service"); }
    setLoading(false);
  }, [mint, usd, side]);

  const sorted = useMemo(() => [...(board?.rows ?? [])].sort((a, b) => (b.premiumPct == null ? -1 : Math.abs(b.premiumPct)) - (a.premiumPct == null ? -1 : Math.abs(a.premiumPct))), [board]);
  const worst = sorted[0];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-[13px] font-bold text-paper">R</div>
          <span className="text-[17px] font-semibold tracking-tight">Rehearsal</span>
          <span className="hidden rounded-full border border-line px-2 py-0.5 text-xs text-mute sm:inline">Solana mainnet</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/report" className="hidden text-sm font-medium text-mute hover:text-ink sm:inline">Execution report</a>
          <WalletMultiButton />
        </div>
      </header>

      <section className="pt-8 pb-10 sm:pt-14">
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Check the price before you buy a tokenized stock.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-mute">
          Tokenized stocks trade 24/7 on thin DEX liquidity. The real stock doesn&apos;t. Rehearsal quotes your exact order on Jupiter and
          compares the fill with Pyth&apos;s on-chain price of the real share, or the PreStocks mark. You see the gap before you sign.
        </p>
        {worst?.premiumPct != null && (
          <p className="mt-6 inline-flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm">
            <span className="text-mute">Biggest gap right now:</span>
            <b>{worst.name}</b>
            <span className={`num font-semibold ${gapTone(worst.premiumPct, worst.kind)}`}>{pct(worst.premiumPct, 1)}</span>
            <span className="text-mute">vs {worst.refSource} on a {usdFmt(board!.probeUsd, 0)} buy</span>
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Order form */}
        <section className="h-fit rounded-2xl border border-line bg-card p-5">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-paper p-1 text-sm font-medium">
            {(["buy", "sell"] as const).map((s) => (
              <button key={s} onClick={() => setSide(s)} className={`rounded-lg py-2 capitalize transition ${side === s ? "bg-card shadow-sm" : "text-mute hover:text-ink"}`}>{s}</button>
            ))}
          </div>

          <label className="mt-5 block text-xs font-medium uppercase tracking-wide text-mute">Token</label>
          <select value={mint} onChange={(e) => { setMint(e.target.value); setResult(null); }}
            className="mt-1.5 w-full rounded-xl border border-line bg-card px-3 py-2.5 text-[15px] outline-none focus:border-ink">
            <optgroup label="PreStocks · pre-IPO">
              {assets.filter((a) => a.kind === "prestock").map((a) => <option key={a.mint} value={a.mint}>{a.symbol} · {a.name}</option>)}
            </optgroup>
            <optgroup label="xStocks · US equities">
              {assets.filter((a) => a.kind === "xstock").map((a) => <option key={a.mint} value={a.mint}>{a.symbol} · {a.name}{a.ref ? "" : " (no reference feed)"}</option>)}
            </optgroup>
          </select>
          {asset && <p className="mt-1.5 text-xs text-mute">Reference: {asset.ref ?? "none available"}</p>}

          <label className="mt-5 block text-xs font-medium uppercase tracking-wide text-mute">Amount ({side === "buy" ? "USDC to spend" : "USD worth to sell"})</label>
          <div className="mt-1.5 flex items-center rounded-xl border border-line px-3 focus-within:border-ink">
            <span className="text-mute">$</span>
            <input value={usd} onChange={(e) => setUsd(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal"
              className="num w-full bg-transparent px-2 py-2.5 text-lg outline-none" />
          </div>
          <div className="mt-2 flex gap-1.5">
            {[100, 1000, 10000, 50000].map((v) => (
              <button key={v} onClick={() => setUsd(String(v))} className="num rounded-lg border border-line px-2.5 py-1 text-xs text-mute hover:border-ink hover:text-ink">
                {v >= 1000 ? `${v / 1000}k` : v}
              </button>
            ))}
          </div>

          <button onClick={() => run()} disabled={loading || !mint}
            className="mt-5 w-full rounded-xl bg-ink py-3 text-[15px] font-semibold text-paper transition hover:opacity-90 disabled:opacity-50">
            {loading ? "Quoting Jupiter and reading Pyth…" : "Rehearse this trade"}
          </button>
          <p className="mt-3 text-xs leading-relaxed text-mute">Nothing is signed at this step. The quote is live from Jupiter and the reference is read from Solana.</p>
        </section>

        {/* Result */}
        <section>
          {err && <div className="rounded-2xl border border-bad/20 bg-bad-bg p-5 text-bad">{err}</div>}
          {!result && !err && (
            <div className="grid h-full min-h-[320px] place-items-center rounded-2xl border border-dashed border-line p-8 text-center text-mute">
              <div>
                <p className="text-lg text-ink">Pick a token and an amount.</p>
                <p className="mt-1 text-sm">You&apos;ll see your real fill, the fair reference, and what the gap costs you in dollars.</p>
              </div>
            </div>
          )}
          {result && <ResultCard r={result} onRefresh={() => run()} />}
        </section>
      </div>

      <FairOrders />

      <ListedVsPre />

      <WalletCheck />

      {/* Board */}
      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Every tokenized stock, priced against the real thing</h2>
            <p className="mt-1 text-sm text-mute">
              A {usdFmt(board?.probeUsd ?? 1000, 0)} market buy on Jupiter right now vs the reference. Sorted by largest gap.
              {board && <> Updated {new Date(board.at).toLocaleTimeString()}.</>}
            </p>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-mute">
              <tr><th className="px-4 py-3 font-medium">Token</th><th className="px-4 py-3 font-medium">Reference</th><th className="px-4 py-3 text-right font-medium">Ref price</th><th className="px-4 py-3 text-right font-medium">Your fill</th><th className="px-4 py-3 text-right font-medium">Gap</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {!board && <tr><td colSpan={6} className="px-4 py-8 text-center text-mute">Quoting 28 tokens on Jupiter…</td></tr>}
              {sorted.map((r) => (
                <tr key={r.mint} className="border-b border-line/70 last:border-0 hover:bg-paper/60">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {r.icon ? <img src={r.icon} alt="" className="h-6 w-6 rounded-full bg-paper object-cover" /> : <div className="h-6 w-6 rounded-full bg-paper" />}
                      <span className="font-medium">{r.symbol}</span><span className="hidden text-mute sm:inline">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-mute">
                    {r.refSource ?? "none"}
                    {r.marketOpen === false && <span className="ml-1.5 rounded bg-paper px-1.5 py-0.5 text-[11px]">US closed</span>}
                  </td>
                  <td className="num px-4 py-2.5 text-right">{r.refPrice ? usdFmt(r.refPrice) : "–"}</td>
                  <td className="num px-4 py-2.5 text-right">{r.fillPrice ? usdFmt(r.fillPrice) : <span className="text-mute">{r.error ? "no route" : "–"}</span>}</td>
                  <td className={`num px-4 py-2.5 text-right font-semibold ${gapTone(r.premiumPct, r.kind)}`}>{pct(r.premiumPct)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => { setMint(r.mint); setSide("buy"); run(r.mint, "buy"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className="rounded-lg border border-line px-2.5 py-1 text-xs hover:border-ink">Rehearse</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-mute">
          xStocks are backed 1:1 by the real share, so a gap is pure cost. PreStocks track a private company through an SPV and can&apos;t be redeemed at mark on demand,
          so a gap there is the market disagreeing with the last valuation. Amounts account for Token-2022 scaled-UI multipliers (dividends and splits).
        </p>
      </section>

      <footer className="mt-16 border-t border-line pt-6 text-xs text-mute">
        Quotes from Jupiter · reference prices read from Pyth price accounts on Solana and the PreStocks API · not investment advice.
      </footer>
    </main>
  );
}

// Where the US session is right now, in New York time.
function nySession(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const hm = Number(p.hour) * 100 + Number(p.minute);
  const wk = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(p.weekday);
  if (wk && hm >= 930 && hm < 1600) return { open: true, label: "US market open" };
  if (wk && hm >= 400 && hm < 930) return { open: true, label: "Pre-market" };
  if (wk && hm >= 1600 && hm < 2000) return { open: true, label: "After hours" };
  if ((["Sun", "Mon", "Tue", "Wed", "Thu"].includes(p.weekday) && hm >= 2000) || (wk && hm < 400)) return { open: true, label: "Overnight session" };
  return { open: false, label: "Closed for the weekend. The next opening cross runs when Pyth resumes Sunday 20:00 ET" };
}

function FairOrders() {
  const [session, setSession] = useState<{ open: boolean; label: string } | null>(null);
  useEffect(() => { const tick = () => setSession(nySession()); const first = setTimeout(tick, 0); const t = setInterval(tick, 60_000); return () => { clearTimeout(first); clearInterval(t); }; }, []);
  const steps = [
    ["Post a fair order", "\"Buy $500 of NVDAx, never more than 0.5% over the real price.\" The USDC sits in an on-chain escrow. The limit is the live Pyth price, not a number you typed."],
    ["Market makers compete", "Anyone can fill it, but the program checks every fill against Pyth inside the transaction. A fill 2% over fair is rejected, and a fill below fair goes through with the difference kept by you."],
    ["Or wait for the open", "Orders placed while the market is closed don't trade into a stale weekend pool. When the Pyth price resumes after 30+ minutes of silence, one cross price is set, and every buyer and seller waiting is matched at exactly that price."],
  ];
  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Fair orders and the Monday-open cross</h2>
        {session && <span className={`rounded-full px-3 py-1 text-xs font-medium ${session.open ? "bg-good-bg text-good" : "bg-warn-bg text-warn"}`}>{session.label}</span>}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-mute">
        An order book where the limit is fair value, and the weekend doesn&apos;t get to set your price.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {steps.map(([t, d], i) => (
          <div key={t} className="rounded-2xl border border-line bg-card p-5">
            <div className="num text-xs text-mute">0{i + 1}</div>
            <div className="mt-1 font-semibold">{t}</div>
            <p className="mt-2 text-sm text-mute">{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-2xl border border-line bg-card p-4 text-sm text-mute">
        Tested end to end on a mainnet fork with the real NVDA Pyth account and NVDAx mint, 17/17:
        a market maker fill at 0.2% over fair accepted, one at 2% over rejected, a better quote filled 0.09% under fair;
        Friday orders held through a simulated weekend, then crossed at the Monday reopen print, with a buyer
        and seller matched at <span className="num text-ink">$231.2865</span>, equal to the cross price to the cent.{" "}
        <a className="text-ink underline" href="https://github.com/Clintobi/rehearsal/blob/main/docs/fork-orders-test-output.txt" target="_blank" rel="noreferrer">Test output</a> ·{" "}
        <a className="text-ink underline" href={`https://explorer.solana.com/address/${GUARD_ID}?cluster=devnet`} target="_blank" rel="noreferrer">program on devnet</a>.
        Placing orders from this page opens with the mainnet deploy.
      </div>
    </section>
  );
}

type CRoute = { symbol: string; issuer: string; kind: string; mint: string; icon?: string; fill: number | null; roundTripPct: number | null; impliedValuation: number | null; unitsBasis: string; structure: string; exitFeeBps: number; multiplier: number };
type CData = { name: string; usd: number; listed: { price: number; mcap: number; source: string } | null; routes: CRoute[]; best: string | null; notes: string[] };

// SpaceX is listed now, and PreStocks SPACEX still trades. Same company, two ways in.
function ListedVsPre() {
  const [d, setD] = useState<CData | null>(null);
  useEffect(() => { fetch("/api/compare?company=spacex&usd=1000").then((r) => r.json()).then((j) => !j.error && setD(j)).catch(() => {}); }, []);
  if (!d || d.routes.length < 2) return null;
  const listed = d.routes.find((r) => r.kind === "xstock");
  const pre = d.routes.find((r) => r.kind === "prestock");
  const disc = listed?.impliedValuation && pre?.impliedValuation ? (1 - pre.impliedValuation / listed.impliedValuation) * 100 : null;
  return (
    <section className="mt-14">
      <h2 className="text-2xl font-semibold tracking-tight">{d.name} listed. The pre-IPO token still trades.</h2>
      <p className="mt-1 max-w-3xl text-sm text-mute">
        Two ways to own the same company on Solana, compared on the valuation your {usdFmt(d.usd, 0)} actually buys at after fees and the Token-2022 multiplier.
        {disc != null && <> Right now the PreStocks token prices {d.name} <b className="text-ink">{Math.abs(disc).toFixed(1)}% {disc > 0 ? "below" : "above"}</b> the listed share.</>}
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {[listed, pre].filter(Boolean).map((r) => (
          <div key={r!.mint} className="rounded-2xl border border-line bg-card p-5">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r!.icon && <img src={r!.icon} alt="" className="h-8 w-8 rounded-full bg-paper object-cover" />}
              <div><div className="font-semibold">{r!.symbol} <span className="font-normal text-mute">· {r!.issuer}</span></div>
                <div className="text-xs text-mute">{r!.structure}</div></div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div><div className="text-xs text-mute">Your fill</div><div className="num font-semibold">{r!.fill ? usdFmt(r!.fill) : "–"}</div></div>
              <div><div className="text-xs text-mute">Implied valuation</div><div className="num font-semibold">{r!.impliedValuation ? bil(r!.impliedValuation) : "–"}</div></div>
              <div><div className="text-xs text-mute">Round trip</div><div className="num font-semibold">{r!.roundTripPct != null ? `−${r!.roundTripPct.toFixed(2)}%` : "–"}</div></div>
            </div>
            <div className="mt-3 text-xs text-mute">{r!.unitsBasis}{r!.exitFeeBps ? ` · ${(r!.exitFeeBps / 100).toFixed(0)}% transfer fee` : ""}{r!.multiplier !== 1 ? ` · ${r!.multiplier}× multiplier` : ""}</div>
          </div>
        ))}
      </div>
      {d.notes.map((n) => <p key={n} className="mt-3 max-w-3xl text-xs text-mute">{n}</p>)}
    </section>
  );
}

type Holding = { symbol: string; name: string; kind: string; mint: string; icon?: string; shares: number; fairPrice: number | null; fairSource: string | null; fairValue: number | null; exitValue: number | null; exitGapPct: number | null; transferFeeBps: number; multiplier: number };

function WalletCheck() {
  const { publicKey } = useWallet();
  const [addr, setAddr] = useState("");
  const [data, setData] = useState<{ holdings: Holding[]; totals: { fair: number; exit: number; stuck: number } } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Falls back to the connected wallet when the box is empty.
  const target = addr.trim() || publicKey?.toBase58() || "";

  async function check() {
    setLoading(true); setErr(null); setData(null);
    const j = await fetch(`/api/wallet?address=${target}`).then((r) => r.json()).catch(() => ({ error: "Could not reach the server" }));
    if (j.error) setErr(j.error); else setData(j);
    setLoading(false);
  }

  return (
    <section className="mt-14">
      <h2 className="text-2xl font-semibold tracking-tight">What are your tokenized stocks really worth?</h2>
      <p className="mt-1 max-w-3xl text-sm text-mute">
        Paste any wallet. For each xStock and PreStocks position you get the fair value (Pyth or the PreStocks mark) next to what selling it on Jupiter right now would actually pay,
        after the Token-2022 transfer fee and scaled-UI multiplier.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder={publicKey ? `Your wallet: ${publicKey.toBase58()}` : "Solana wallet address"}
          className="num w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-ink" />
        <button onClick={check} disabled={loading || target.length < 32}
          className="shrink-0 rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-50">{loading ? "Quoting every exit…" : "Check wallet"}</button>
      </div>
      {err && <p className="mt-3 text-sm text-bad">{err}</p>}
      {data && data.holdings.length === 0 && <p className="mt-3 text-sm text-mute">No xStocks or PreStocks in this wallet.</p>}
      {data && data.holdings.length > 0 && (
        <div className="mt-4 rounded-2xl border border-line bg-card">
          <div className="grid grid-cols-1 gap-px border-b border-line bg-line sm:grid-cols-3">
            <div className="bg-card p-4"><div className="text-xs text-mute">Fair value</div><div className="num mt-1 text-xl font-semibold">{usdFmt(data.totals.fair, 0)}</div></div>
            <div className="bg-card p-4"><div className="text-xs text-mute">Sell everything now</div><div className="num mt-1 text-xl font-semibold">{usdFmt(data.totals.exit, 0)}</div></div>
            <div className="bg-card p-4"><div className="text-xs text-mute">No on-chain exit at this size</div>
              <div className={`num mt-1 text-xl font-semibold ${data.totals.stuck > 0 ? "text-bad" : ""}`}>{usdFmt(data.totals.stuck, 0)}</div></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-mute"><tr>
                <th className="px-4 py-3 font-medium">Position</th><th className="px-4 py-3 text-right font-medium">Fair value</th>
                <th className="px-4 py-3 text-right font-medium">Sell now</th><th className="px-4 py-3 text-right font-medium">Exit vs fair</th><th className="px-4 py-3 font-medium">Fees &amp; scaling</th></tr></thead>
              <tbody>{data.holdings.map((h) => (
                <tr key={h.mint} className="border-t border-line/70">
                  <td className="px-4 py-2.5"><div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {h.icon ? <img src={h.icon} alt="" className="h-6 w-6 rounded-full bg-paper object-cover" /> : <div className="h-6 w-6 rounded-full bg-paper" />}
                    <div><div className="font-medium">{h.symbol}</div><div className="num text-xs text-mute">{h.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })} shown in wallet</div></div></div></td>
                  <td className="num px-4 py-2.5 text-right">{h.fairValue != null ? usdFmt(h.fairValue) : "–"}<div className="text-xs text-mute">{h.fairSource}</div></td>
                  <td className="num px-4 py-2.5 text-right">{h.exitValue != null ? usdFmt(h.exitValue) : <span className="text-bad">no route</span>}</td>
                  <td className={`num px-4 py-2.5 text-right font-semibold ${h.exitGapPct == null ? "text-mute" : h.exitGapPct > 5 ? "text-bad" : h.exitGapPct > 1 ? "text-warn" : "text-good"}`}>
                    {h.exitGapPct == null ? "–" : `${h.exitGapPct > 0 ? "−" : "+"}${Math.abs(h.exitGapPct).toFixed(2)}%`}</td>
                  <td className="px-4 py-2.5 text-xs text-mute">{h.transferFeeBps ? `${(h.transferFeeBps / 100).toFixed(2)}% sell fee` : "no fee"}{h.multiplier !== 1 ? ` · ${h.multiplier.toFixed(4)}× multiplier` : ""}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, sub, cls = "" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; cls?: string }) {
  return (
    <div className="rounded-xl border border-line p-3.5">
      <div className="text-xs text-mute">{label}</div>
      <div className={`num mt-1 text-lg font-semibold ${cls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-mute">{sub}</div>}
    </div>
  );
}

function ResultCard({ r, onRefresh }: { r: Rehearsal; onRefresh: () => void }) {
  const { publicKey, signTransaction, connected } = useWallet();
  const [exec, setExec] = useState<{ state: "idle" | "building" | "signing" | "sending" | "done" | "error"; msg?: string; sig?: string }>({ state: "idle" });
  const [age, setAge] = useState(0);
  useEffect(() => { const t = setInterval(() => setAge(Math.round((Date.now() - r.at) / 1000)), 1000); return () => clearInterval(t); }, [r.at]);
  const stale = age > 30;
  const v = r.verdict;
  const ref = r.reference;
  const buy = r.side === "buy";

  const [brk, setBrk] = useState<{ cluster: string; nasdaq: { halted: boolean; reason: string | null }; breaker: { address: string; state: string; bandBps: number; exchangeHalted: boolean } | null } | null>(null);
  useEffect(() => {
    if (r.asset.kind !== "xstock") return;
    fetch("/api/breakers").then((x) => x.json()).then((d) => {
      const row = d.rows?.find((x: { symbol: string }) => x.symbol === r.asset.symbol);
      if (row) setBrk({ cluster: d.cluster, ...row });
    }).catch(() => {});
  }, [r.asset.symbol, r.asset.kind]);
  const defaultTol = r.asset.kind === "prestock" ? 500 : 100;
  const [guardOn, setGuardOn] = useState(GUARD_LIVE);
  const [tol, setTol] = useState(defaultTol);

  async function execute() {
    if (!publicKey || !signTransaction) return;
    try {
      setExec({ state: "building" });
      const body = JSON.stringify({ quote: r.quote, userPublicKey: publicKey.toBase58(), toleranceBps: tol });
      const b = await fetch(guardOn ? "/api/guarded-swap" : "/api/swap", { method: "POST", headers: { "content-type": "application/json" }, body }).then((x) => x.json());
      if (b.error) throw new Error(b.error);
      setExec({ state: "signing" });
      const tx = VersionedTransaction.deserialize(b64ToBytes(b.swapTransaction));
      const signed = await signTransaction(tx);
      setExec({ state: "sending" });
      const s = await fetch("/api/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signed: bytesToB64(signed.serialize()), lastValidBlockHeight: b.lastValidBlockHeight }) }).then((x) => x.json());
      if (s.error) {
        const blocked = /custom program error: 0x1770|"Custom":6000/.test(s.error);
        throw Object.assign(new Error(blocked ? "Guard blocked this fill on-chain: it was worse than fair value by more than your tolerance. The whole transaction reverted, so no funds moved." : s.error), { sig: s.signature });
      }
      setExec({ state: "done", sig: s.signature });
    } catch (e) {
      setExec({ state: "error", msg: e instanceof Error ? e.message : String(e), sig: (e as { sig?: string }).sig });
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {r.asset.icon && <img src={r.asset.icon} alt="" className="h-8 w-8 rounded-full bg-paper object-cover" />}
          <div>
            <div className="font-semibold">{buy ? "Buy" : "Sell"} {usdFmt(r.usd, 0)} of {r.asset.symbol}</div>
            <div className="text-xs text-mute">{r.asset.kind === "xstock" ? "xStock, backed 1:1 by the real share" : "PreStocks, pre-IPO exposure via SPV"}</div>
          </div>
        </div>
        <button onClick={onRefresh} className="rounded-lg border border-line px-2.5 py-1 text-xs text-mute hover:border-ink hover:text-ink">
          {stale ? "Quote is stale · refresh" : `Quoted ${age}s ago`}
        </button>
      </div>

      <div className={`mt-4 rounded-xl border p-4 ${tone[v.level]}`}>
        <div className="text-[15px] font-semibold leading-snug">{v.headline}</div>
        {v.reasons.length > 0 && <ul className="mt-2 space-y-1 text-sm opacity-90">{v.reasons.map((x) => <li key={x}>· {x}</li>)}</ul>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat label={buy ? "Your fill price" : "Your sell price"} value={usdFmt(r.fillPrice)} sub={`${r.tokens.toFixed(4)} ${r.asset.symbol}`} />
        <Stat label="Reference price" value={ref ? usdFmt(ref.price) : "–"} sub={ref?.source ?? "no feed"} />
        <Stat label="Gap vs reference" value={pct(r.premiumPct)} cls={gapTone(r.premiumPct, r.asset.kind)}
          sub={r.overpayUsd == null ? undefined : r.asset.kind === "prestock"
            ? `${usdFmt(Math.abs(r.overpayUsd))} ${r.overpayUsd >= 0 ? "above" : "below"} mark value`
            : `${r.overpayUsd >= 0 ? "Costs you" : "Saves you"} ${usdFmt(Math.abs(r.overpayUsd))}`} />
        <Stat label="Size impact" value={pct(r.sizeImpactPct)} sub="vs a $10 order" cls={(r.sizeImpactPct ?? 0) > 1 ? "text-warn" : ""} />
        <Stat label="Round trip" value={r.roundTripCostPct == null ? "–" : `−${r.roundTripCostPct.toFixed(2)}%`} sub="buy then sell straight back" cls={(r.roundTripCostPct ?? 0) > 2 ? "text-warn" : ""} />
        {r.impliedValuation
          ? <Stat label="Implied valuation" value={bil(r.impliedValuation)} sub={`mark ${bil(r.markValuation!)}`} />
          : <Stat label="US market" value={ref?.market ? (ref.market.open ? "Open" : "Closed") : "–"} sub={ref?.market?.label} />}
      </div>

      <div className="mt-4 space-y-1.5 rounded-xl bg-paper p-3.5 text-xs text-mute">
        <div>Route: <span className="text-ink">{r.route.join(" → ")}</span> via Jupiter</div>
        {ref?.account && (
          <div>Oracle: <a className="text-ink underline decoration-line underline-offset-2" href={`https://solscan.io/account/${ref.account}`} target="_blank" rel="noreferrer">{short(ref.account)}</a>
            {" "}· published {ref.ageSec}s ago · ±{usdFmt(ref.conf ?? 0, 3)} confidence</div>
        )}
        {ref && !ref.account && <div>Reference: <span className="text-ink">{ref.detail}</span></div>}
        {r.uiMultiplier !== 1 && <div>Token-2022 multiplier {r.uiMultiplier.toFixed(4)}× applied (splits and dividends)</div>}
        {brk && (
          <div>
            Circuit breaker: Nasdaq{" "}
            <span className={brk.nasdaq.halted ? "font-semibold text-bad" : "text-ink"}>{brk.nasdaq.halted ? `HALTED (${brk.nasdaq.reason})` : "trading"}</span>
            {brk.breaker && <> · on-chain breaker <a className="text-ink underline decoration-line underline-offset-2" href={`https://explorer.solana.com/address/${brk.breaker.address}?cluster=${brk.cluster}`} target="_blank" rel="noreferrer">{brk.breaker.exchangeHalted ? "halted" : brk.breaker.state}</a> ({brk.breaker.bandBps / 100}% band, {brk.cluster})</>}
          </div>
        )}
        {r.transferFeeBps > 0 && <div>Token-2022 transfer fee {(r.transferFeeBps / 100).toFixed(2)}% withheld on every transfer, included in the fill above</div>}
      </div>

      <div className="mt-4 rounded-xl border border-line p-3.5">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={guardOn} disabled={!GUARD_LIVE} onChange={(e) => setGuardOn(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--color-ink)]" />
          <span className="text-sm">
            <b>Guard this trade on-chain</b>
            <span className="block text-mute">
              Wraps the swap in the Rehearsal Guard program. The program checks what you actually received against {ref?.account ? "the Pyth price" : "the PreStocks mark"} inside the same transaction,
              and reverts everything if the fill is more than
              <input type="number" min={0} max={5000} step={10} value={tol} onChange={(e) => setTol(Number(e.target.value))}
                className="num mx-1 w-16 rounded border border-line px-1 text-ink" /> bps worse.
              {!GUARD_LIVE && <> The program (<a className="underline" href={GUARD_DEVNET ? `https://explorer.solana.com/address/${GUARD_ID}?cluster=devnet` : "https://github.com/Clintobi/rehearsal/tree/main/onchain"} target="_blank" rel="noreferrer">{short(GUARD_ID)}</a>) passes 9/9 end-to-end tests on a mainnet fork{GUARD_DEVNET ? " and is deployed on devnet" : ""}. It isn&apos;t on mainnet yet, so mainnet trades here go through unguarded.</>}
            </span>
          </span>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!connected ? (
          <span className="text-sm text-mute">Connect a wallet to place this trade.</span>
        ) : (
          <button onClick={execute} disabled={stale || ["building", "signing", "sending"].includes(exec.state)}
            className={`rounded-xl px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-50 ${v.level === "bad" ? "bg-bad" : "bg-ink"}`}>
            {exec.state === "building" ? "Building transaction…" : exec.state === "signing" ? "Approve in wallet…" : exec.state === "sending" ? "Confirming on Solana…"
              : stale ? "Refresh the quote first" : v.level === "bad" ? `${buy ? "Buy" : "Sell"} anyway at ${usdFmt(r.fillPrice)}` : `${buy ? "Buy" : "Sell"} at ${usdFmt(r.fillPrice)}`}
          </button>
        )}
        {exec.state === "done" && exec.sig && <a className="text-sm font-medium text-good underline" href={`https://solscan.io/tx/${exec.sig}`} target="_blank" rel="noreferrer">{guardOn ? "Filled inside the guard" : "Filled"} · view on Solscan</a>}
        {exec.state === "error" && <span className="text-sm text-bad">{exec.msg}{exec.sig && <> · <a className="underline" href={`https://solscan.io/tx/${exec.sig}`} target="_blank" rel="noreferrer">tx</a></>}</span>}
      </div>
    </div>
  );
}
