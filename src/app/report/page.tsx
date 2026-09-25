"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const FILLS_URL = process.env.NEXT_PUBLIC_FILLS_URL ?? "https://gist.githubusercontent.com/Clintobi/7b15feb84f4634fa5ef05eec7e248f9c/raw/fills.json";
const REPORT_URL = process.env.NEXT_PUBLIC_REPORT_URL ?? "https://gist.githubusercontent.com/Clintobi/7b15feb84f4634fa5ef05eec7e248f9c/raw/report.json";

type Summary = { fills: number; graded: number; enough?: boolean; volume_usd: number; median_gap_bps: number | null; p90_gap_bps: number | null; within_25bps: number | null; within_100bps: number | null; median_markout_5m_bps: number | null };
type Row = Summary & { key: string };
type Worst = { sig: string; symbol: string; side: string; usd: number; fill: number; ref: number; ref_source: string; gap_bps: number; venue: string; router: string; t: number };
type Report = {
  generated_at: number; started_at: number; min_group?: number; min_grade_usd?: number;
  method: Record<string, string>;
  coverage: { txs_seen: number; txs_sampled: number; fills: number };
  overall: { xstocks: Summary; prestocks: Summary };
  by_reference: Row[]; by_venue: Row[]; by_router: Row[]; by_token: Row[]; by_session: Row[]; by_size: Row[];
  worst_fills: Worst[];
  dataset?: { fills: number; sha256: string; memo: string; commitment_tx: string | null; cluster: string };
};

const bps = (n: number | null | undefined) => (n == null ? "–" : `${n > 0 ? "+" : ""}${n.toFixed(1)}`);
const share = (n: number | null | undefined) => (n == null ? "–" : `${Math.round(n * 100)}%`);
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const tone = (n: number | null | undefined) => (n == null ? "text-mute" : n > 100 ? "text-bad" : n > 25 ? "text-warn" : "text-good");
const ok = (r: Summary) => r.enough ?? r.graded >= 10;
const ago = (t: number) => { const m = Math.round((Date.now() / 1000 - t) / 60); return m < 60 ? `${m} min ago` : `${(m / 60).toFixed(1)} h ago`; };

function Table({ title, note, rows, keyLabel }: { title: string; note?: string; rows: Row[]; keyLabel: string }) {
  if (!rows.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {note && <p className="mt-1 max-w-3xl text-sm text-mute">{note}</p>}
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-mute">
            <tr>
              <th className="px-4 py-3 font-medium">{keyLabel}</th>
              <th className="px-4 py-3 text-right font-medium">Fills graded</th>
              <th className="px-4 py-3 text-right font-medium">Volume</th>
              <th className="px-4 py-3 text-right font-medium">Median gap (bps)</th>
              <th className="px-4 py-3 text-right font-medium">Worst 10% (bps)</th>
              <th className="px-4 py-3 text-right font-medium">Within 25 bps</th>
              <th className="px-4 py-3 text-right font-medium">5-min markout</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].sort((a, b) => Number(ok(b)) - Number(ok(a))).map((r) => ok(r) ? (
              <tr key={r.key} className="border-b border-line/70 last:border-0">
                <td className="px-4 py-2.5 font-medium">{r.key}</td>
                <td className="num px-4 py-2.5 text-right">{r.graded}<span className="text-mute"> / {r.fills}</span></td>
                <td className="num px-4 py-2.5 text-right">{usd(r.volume_usd)}</td>
                <td className={`num px-4 py-2.5 text-right font-semibold ${tone(r.median_gap_bps)}`}>{bps(r.median_gap_bps)}</td>
                <td className={`num px-4 py-2.5 text-right ${tone(r.p90_gap_bps)}`}>{bps(r.p90_gap_bps)}</td>
                <td className="num px-4 py-2.5 text-right">{share(r.within_25bps)}</td>
                <td className="num px-4 py-2.5 text-right">{bps(r.median_markout_5m_bps)}</td>
              </tr>
            ) : (
              <tr key={r.key} className="border-b border-line/70 text-mute last:border-0">
                <td className="px-4 py-2.5">{r.key}</td>
                <td className="num px-4 py-2.5 text-right">{r.graded}<span> / {r.fills}</span></td>
                <td className="num px-4 py-2.5 text-right">{usd(r.volume_usd)}</td>
                <td colSpan={4} className="px-4 py-2.5 text-right text-xs">Not enough graded trades yet</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type BRow = { symbol: string; ticker: string; nasdaq: { halted: boolean; reason: string | null; at: string | null; resumed: boolean | null }; breaker: { address: string; state: string; bandBps: number; exchangeHalted: boolean; haltReason: string; trips: number } | null };

function HaltSync() {
  const [d, setD] = useState<{ cluster: string; feedItems: number; rows: BRow[] } | null>(null);
  useEffect(() => { fetch("/api/breakers").then((x) => x.json()).then(setD).catch(() => {}); }, []);
  if (!d) return null;
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">Halt-sync and circuit breakers</h2>
      <p className="mt-1 max-w-3xl text-sm text-mute">
        The SEC exemption requires on-chain venues to stop trading a tokenized stock when its primary exchange halts it. A relayer mirrors Nasdaq&apos;s official halt feed
        ({d.feedItems} entries today) onto each stock&apos;s on-chain circuit breaker. The breaker also trips on its own, LULD-style, when the Pyth price leaves a 5% band around its
        rolling 5-minute reference for 15 seconds. The Rehearsal Guard refuses trades while it&apos;s tripped. Breakers are on {d.cluster} until the mainnet deploy.
      </p>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-mute">
            <tr><th className="px-4 py-3 font-medium">Stock</th><th className="px-4 py-3 font-medium">Nasdaq halt feed</th><th className="px-4 py-3 font-medium">On-chain breaker</th><th className="px-4 py-3 text-right font-medium">Band</th><th className="px-4 py-3 text-right font-medium">Trips</th></tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.symbol} className="border-b border-line/70 last:border-0">
                <td className="px-4 py-2.5 font-medium">{r.symbol} <span className="text-mute">{r.ticker}</span></td>
                <td className={`px-4 py-2.5 ${r.nasdaq.halted ? "font-semibold text-bad" : "text-good"}`}>{r.nasdaq.halted ? `Halted (${r.nasdaq.reason}) since ${r.nasdaq.at}` : "Trading"}</td>
                <td className="px-4 py-2.5">{r.breaker ? <a className="underline decoration-line underline-offset-2" href={`https://explorer.solana.com/address/${r.breaker.address}?cluster=${d.cluster}`} target="_blank" rel="noreferrer">{r.breaker.exchangeHalted ? `halted (${r.breaker.haltReason})` : r.breaker.state}</a> : "–"}</td>
                <td className="num px-4 py-2.5 text-right">{r.breaker ? `${r.breaker.bandBps / 100}%` : "–"}</td>
                <td className="num px-4 py-2.5 text-right">{r.breaker?.trips ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ReportPage() {
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const load = () => fetch(`${REPORT_URL}?t=${Date.now()}`, { cache: "no-store" }).then((x) => x.json()).then(setR).catch(() => setErr("Could not load the report"));
    load();
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-[13px] font-bold text-paper">R</div>
          <span className="text-[17px] font-semibold tracking-tight">Rehearsal</span>
        </Link>
        <Link href="/" className="text-sm text-mute hover:text-ink">Check a trade →</Link>
      </header>

      <section className="pt-8 pb-6 sm:pt-12">
        <p className="text-sm font-medium uppercase tracking-wide text-mute">Open execution report</p>
        <h1 className="mt-2 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          How fairly are tokenized stocks filling on Solana?
        </h1>
        <p className="mt-5 max-w-3xl text-lg text-mute">
          On 17 September 2026 the SEC exempted on-chain venues for tokenized stocks from Rule 605, the rule that makes US brokers publish how well they fill customer orders.
          This page publishes it anyway. Every sampled trade is graded against the real stock price at the second it filled, and grouped by venue, router, session and size.
        </p>
        {r && (
          <p className="mt-4 text-sm text-mute">
            Recording since {new Date(r.started_at * 1000).toUTCString().slice(5, 22)} UTC · updated {ago(r.generated_at)} ·{" "}
            {r.coverage.txs_seen.toLocaleString()} transactions seen, {r.coverage.txs_sampled.toLocaleString()} sampled, {r.coverage.fills.toLocaleString()} fills parsed ·{" "}
            <a className="underline" href={REPORT_URL} target="_blank" rel="noreferrer">raw data</a>
          </p>
        )}
      </section>

      <section className="mb-8 grid gap-3 rounded-2xl border border-line bg-card p-5 text-sm sm:grid-cols-2">
        <div><b>Gap.</b> <span className="text-mute">How much worse than the real price a trader paid, in basis points (bps). 100 bps = 1%. +10 means they paid 0.1% over the real price. Negative means they got a better price than the reference.</span></div>
        <div><b>Reference (the real price).</b> <span className="text-mute">For US stock tokens, Pyth&apos;s live price of the actual share, read on-chain. Where Pyth has no feed on Solana, the issuer&apos;s reference price, which is weaker. For PreStocks, the issuer&apos;s mark (their valuation of the private company).</span></div>
        <div><b>Median / worst 10%.</b> <span className="text-mute">The typical trade, and how bad the unluckiest one in ten was.</span></div>
        <div><b>5-min markout.</b> <span className="text-mute">Where the real price went 5 minutes after the trade, from the trader&apos;s side. Negative means the price moved against them right after, a sign faster traders picked them off.</span></div>
      </section>

      {err && <p className="text-bad">{err}</p>}
      {!r && !err && <p className="text-mute">Loading the report…</p>}

      {r && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {([["xStocks (US equities)", r.overall.xstocks, "vs Pyth, or the issuer reference where no Pyth feed is on-chain"], ["PreStocks (pre-IPO)", r.overall.prestocks, "vs the PreStocks mark. This mostly measures how far the market trades from PreStocks' own valuation, not fill quality"]] as const).map(([name, s, sub]) => (
              <div key={name} className="rounded-2xl border border-line bg-card p-5">
                <div className="text-sm text-mute">{name}</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`num text-4xl font-semibold ${ok(s) ? tone(s.median_gap_bps) : "text-mute"}`}>{bps(s.median_gap_bps)}</span>
                  <span className="text-sm text-mute">bps median gap, {sub}</span>
                </div>
                {!ok(s) && <p className="mt-2 rounded-lg bg-warn-bg px-2.5 py-1.5 text-xs text-warn">Only {s.graded} graded trades so far. Too few to read; this fills in as the recorder runs.</p>}
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div><div className="text-xs text-mute">Fills graded</div><div className="num font-semibold">{s.graded.toLocaleString()}</div></div>
                  <div><div className="text-xs text-mute">Worst 10%</div><div className={`num font-semibold ${tone(s.p90_gap_bps)}`}>{bps(s.p90_gap_bps)} bps</div></div>
                  <div><div className="text-xs text-mute">Within 25 bps</div><div className="num font-semibold">{share(s.within_25bps)}</div></div>
                </div>
              </div>
            ))}
          </div>

          <Table title="By venue" keyLabel="Venue (pools that filled)" rows={r.by_venue}
            note="Gap = how much worse than the real price the trader got, in basis points (100 bps = 1%). Negative means better than the reference. Markout = where the real price went 5 minutes later, from the trader's side." />
          <Table title="By router" keyLabel="Router" rows={r.by_router} note="Who routed the order. Direct means the trader called the pool without an aggregator." />
          <Table title="By trade size" keyLabel="Size" rows={r.by_size} />
          <Table title="By market session" keyLabel="Asset : session" rows={r.by_session} note="Off-hours the reference is the latest overnight or closing print, so gaps there partly reflect real news the reference hasn't priced yet." />
          <Table title="By token" keyLabel="Token" rows={r.by_token} />
          <Table title="By reference" keyLabel="Reference" rows={r.by_reference} note="pyth = Pyth equity price account on Solana. xstocks-ref = the issuer's reference price, a weaker benchmark. mark = PreStocks mark. unparsed = multi-leg transactions we don't grade." />

          <HaltSync />

          {r.worst_fills.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold tracking-tight">Worst fills over $50</h2>
              <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-card">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-mute">
                    <tr><th className="px-4 py-3 font-medium">Trade</th><th className="px-4 py-3 text-right font-medium">Size</th><th className="px-4 py-3 text-right font-medium">Fill</th><th className="px-4 py-3 text-right font-medium">Reference</th><th className="px-4 py-3 text-right font-medium">Gap</th><th className="px-4 py-3 font-medium">Venue</th><th className="px-4 py-3 font-medium">Tx</th></tr>
                  </thead>
                  <tbody>
                    {r.worst_fills.map((w) => (
                      <tr key={w.sig} className="border-b border-line/70 last:border-0">
                        <td className="px-4 py-2.5"><b>{w.symbol}</b> <span className="text-mute">{w.side} · {ago(w.t)}</span></td>
                        <td className="num px-4 py-2.5 text-right">{usd(w.usd)}</td>
                        <td className="num px-4 py-2.5 text-right">${w.fill.toFixed(2)}</td>
                        <td className="num px-4 py-2.5 text-right">${w.ref.toFixed(2)} <span className="text-xs text-mute">{w.ref_source}</span></td>
                        <td className={`num px-4 py-2.5 text-right font-semibold ${tone(w.gap_bps)}`}>{bps(w.gap_bps)} bps</td>
                        <td className="px-4 py-2.5 text-mute">{w.venue} <span className="text-xs">via {w.router}</span></td>
                        <td className="px-4 py-2.5"><a className="underline" href={`https://solscan.io/tx/${w.sig}`} target="_blank" rel="noreferrer">view</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {r.dataset && (
            <section className="mt-10 rounded-2xl border border-line bg-card p-5 text-sm">
              <h2 className="text-xl font-semibold tracking-tight">Verify this report</h2>
              <p className="mt-1 max-w-3xl text-mute">
                You don&apos;t have to trust these numbers. The exact dataset behind them is published, and its fingerprint is written to Solana every time the report updates.
              </p>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-mute">
                <li>Download the dataset: <a className="text-ink underline" href={FILLS_URL} target="_blank" rel="noreferrer">fills.json</a> ({r.dataset.fills} graded fills, each with its Solana transaction signature).</li>
                <li>Its SHA-256 must be <code className="num break-all rounded bg-paper px-1 text-ink">{r.dataset.sha256}</code>, the same value committed on-chain{r.dataset.commitment_tx && <> in <a className="text-ink underline" href={`https://explorer.solana.com/tx/${r.dataset.commitment_tx}?cluster=${r.dataset.cluster}`} target="_blank" rel="noreferrer">this memo transaction</a> ({r.dataset.cluster})</>}.</li>
                <li>Recompute everything: <code className="num rounded bg-paper px-1 text-ink">node zk/verify-offchain.mjs fills.json</code> from the <a className="text-ink underline" href="https://github.com/Clintobi/rehearsal/tree/main/zk" target="_blank" rel="noreferrer">repo</a>. It prints the same medians and the exact bytes the ZK program commits.</li>
                <li>Spot-check any fill against the chain with its signature.</li>
              </ol>
              <p className="mt-4 text-xs text-mute">
                Zero-knowledge proof: an SP1 program (<a className="underline" href="https://github.com/Clintobi/rehearsal/tree/main/zk" target="_blank" rel="noreferrer">zk/</a>) recomputes the report from raw fills without trusting any precomputed number. The program is ready to prove; producing the Solana-verifiable Groth16 proof needs a 16 GB+ prover machine, so today the report is verified by recomputation plus the on-chain commitment above.
              </p>
            </section>
          )}

          <section className="mt-10 max-w-3xl space-y-2 text-sm text-mute">
            <h2 className="text-xl font-semibold tracking-tight text-ink">Method</h2>
            {Object.entries(r.method).map(([k, v]) => <p key={k}><b className="text-ink capitalize">{k}.</b> {v}</p>)}
            <p><b className="text-ink">Not an NBBO.</b> Pyth is a reference price, not the legal National Best Bid and Offer. The grades show how far each fill landed from the best public reference available on-chain.</p>
          </section>
        </>
      )}
    </main>
  );
}
