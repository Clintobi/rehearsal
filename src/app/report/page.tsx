"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ago } from "@/lib/format";
import { cx, InfoTip, Segmented, Skeleton } from "@/components/ui";

const FILLS_URL = process.env.NEXT_PUBLIC_FILLS_URL ?? "https://gist.githubusercontent.com/Clintobi/7b15feb84f4634fa5ef05eec7e248f9c/raw/fills.json";
const REPORT_URL = process.env.NEXT_PUBLIC_REPORT_URL ?? "https://gist.githubusercontent.com/Clintobi/7b15feb84f4634fa5ef05eec7e248f9c/raw/report.json";

type Summary = { fills: number; graded: number; enough?: boolean; volume_usd: number; median_gap_bps: number | null; p90_gap_bps: number | null; within_25bps: number | null; median_markout_5m_bps: number | null };
type Row = Summary & { key: string };
type Worst = { sig: string; symbol: string; side: string; usd: number; fill: number; ref: number; ref_source: string; gap_bps: number; venue: string; router: string; t: number };
type Report = {
  generated_at: number; started_at: number;
  coverage: { txs_seen: number; txs_sampled: number; fills: number };
  overall: { xstocks: Summary; prestocks: Summary };
  by_venue: Row[]; by_router: Row[]; by_token: Row[]; by_session: Row[]; by_size: Row[];
  worst_fills: Worst[];
  dataset?: { fills: number; sha256: string; commitment_tx: string | null; cluster: string };
};

// Basis points → percent, the unit people read.
const p = (bps: number | null | undefined, d = 2) => {
  if (bps == null) return "–";
  const v = bps / 100;
  if (Math.abs(v) < 0.5 * 10 ** -d) return `${(0).toFixed(d)}%`;
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}%`;
};
const share = (n: number | null | undefined) => (n == null ? "–" : `${Math.round(n * 100)}%`);
const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const tone = (bps: number | null | undefined) => (bps == null ? "text-muted" : bps > 100 ? "text-bad" : bps > 25 ? "text-warn" : "text-good");
const enough = (r: Summary) => r.enough ?? r.graded >= 10;
const GROUPS = { by_size: "Order size", by_venue: "Venue", by_router: "Route", by_token: "Stock" } as const;
type GroupKey = keyof typeof GROUPS;

const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted transition-transform group-open:rotate-180" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);

export default function ReportPage() {
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupKey>("by_size");
  useEffect(() => {
    const load = () => fetch(`${REPORT_URL}?t=${Date.now()}`, { cache: "no-store" }).then((x) => x.json()).then(setR).catch(() => setErr("The report couldn't load. Try again in a minute."));
    load();
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, []);

  const x = r?.overall.xstocks;
  const small = r?.by_size.find((s) => s.key === "< $100");
  const mid = r?.by_size.find((s) => s.key === "$100–1k");

  return (
    <div className="space-y-10">
      <header className="max-w-3xl">
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[34px]">How fairly are tokenized stocks filling?</h1>
        <p className="mt-3 text-[16px] text-ink-2">
          Brokers have to publish how well they fill your orders. On-chain stock venues don&apos;t, since the SEC exempted them in September. So we grade the trades we see against the real stock price, in public.
        </p>
        {r && <p className="mt-3 text-[13px] text-muted">Updated {ago(r.generated_at)} · {r.coverage.fills.toLocaleString()} trades since {new Date(r.started_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>}
      </header>

      {err && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-[14px] text-bad">{err}</p>}
      {!r && !err && <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>}

      {r && x && (
        <>
          <dl className="grid gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-3">
            <div className="bg-panel p-5">
              <dt className="text-[13px] text-muted">Typical trade, US stocks</dt>
              <dd className={cx("num mt-1 text-[30px] font-semibold tracking-tight", tone(x.median_gap_bps))}>{p(x.median_gap_bps)}</dd>
              <dd className="mt-0.5 text-[13px] text-muted">vs the real price · {share(x.within_25bps)} within 0.25%</dd>
            </div>
            {small && mid && enough(small) && enough(mid) && (small.median_gap_bps ?? 0) - (mid.median_gap_bps ?? 0) >= 10 ? (
              <div className="bg-panel p-5">
                <dt className="text-[13px] text-muted">Trades under $100</dt>
                <dd className={cx("num mt-1 text-[30px] font-semibold tracking-tight", tone(small.median_gap_bps))}>{p(small.median_gap_bps)}</dd>
                <dd className="mt-0.5 text-[13px] text-muted">vs {p(mid.median_gap_bps)} for $100 to $1,000</dd>
              </div>
            ) : (
              <div className="bg-panel p-5">
                <dt className="text-[13px] text-muted">Pre-IPO tokens vs valuation</dt>
                <dd className={cx("num mt-1 text-[30px] font-semibold tracking-tight", enough(r.overall.prestocks) ? "text-ink" : "text-muted")}>{enough(r.overall.prestocks) ? p(r.overall.prestocks.median_gap_bps, 1) : "–"}</dd>
                <dd className="mt-0.5 text-[13px] text-muted">{enough(r.overall.prestocks) ? "typical distance from PreStocks' mark" : "Not enough trades yet"}</dd>
              </div>
            )}
            <div className="bg-panel p-5">
              <dt className="text-[13px] text-muted">Unluckiest 1 in 10</dt>
              <dd className={cx("num mt-1 text-[30px] font-semibold tracking-tight", tone(x.p90_gap_bps))}>{p(x.p90_gap_bps)}</dd>
              <dd className="mt-0.5 text-[13px] text-muted">or worse, US stocks</dd>
            </div>
          </dl>

          <section aria-labelledby="breakdown" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="breakdown" className="text-[19px] font-semibold">Breakdown</h2>
              <div className="w-full sm:w-[440px]">
                <Segmented label="Group by" value={group} onChange={setGroup} options={(Object.keys(GROUPS) as GroupKey[]).map((k) => ({ value: k, label: GROUPS[k] }))} />
              </div>
            </div>
            <div className="overflow-x-auto rounded-[10px] border border-line bg-panel">
              <table className="w-full min-w-[600px] text-[14px]">
                <thead className="border-b border-line text-left text-[13px] text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">{GROUPS[group]}</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Trades</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Volume</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Typical</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Worst 1 in 10</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      <span className="inline-flex items-center gap-1">After 5 min<InfoTip>Where the real price went five minutes after the trade. Negative means it moved against the trader: someone faster got there first.</InfoTip></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...r[group]].sort((a, b) => Number(enough(b)) - Number(enough(a))).map((row) => (
                    <tr key={row.key} className={cx("border-b border-line last:border-0", !enough(row) && "text-muted")}>
                      <td className="px-4 py-3 font-medium">{row.key}</td>
                      <td className="num px-4 py-3 text-right">{row.graded}</td>
                      <td className="num px-4 py-3 text-right">{money(row.volume_usd)}</td>
                      {enough(row) ? (
                        <>
                          <td className={cx("num px-4 py-3 text-right font-semibold", tone(row.median_gap_bps))}>{p(row.median_gap_bps)}</td>
                          <td className={cx("num px-4 py-3 text-right", tone(row.p90_gap_bps))}>{p(row.p90_gap_bps)}</td>
                          <td className="num px-4 py-3 text-right text-ink-2">{p(row.median_markout_5m_bps)}</td>
                        </>
                      ) : <td colSpan={3} className="px-4 py-3 text-right text-[13px]">Too few trades yet</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-muted">Positive means the trader paid more than the real price. Pre-IPO tokens are measured against PreStocks&apos; valuation, which is an estimate.</p>
          </section>

          {r.worst_fills.some((w) => w.ref_source !== "mark") && (
            <section aria-labelledby="worst" className="space-y-4">
              <h2 id="worst" className="text-[19px] font-semibold">Worst recent fills, US stocks</h2>
              <ul className="divide-y divide-line rounded-[10px] border border-line bg-panel">
                {r.worst_fills.filter((w) => w.ref_source !== "mark").slice(0, 8).map((w) => (
                  <li key={w.sig} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-[14px] sm:grid-cols-[140px_90px_1fr_80px_auto]">
                    <span className="font-semibold">{w.symbol} <span className="font-normal text-muted">{w.side}</span></span>
                    <span className="num text-ink-2">{money(w.usd)}</span>
                    <span className="num text-ink-2">${w.fill.toFixed(2)} <span className="text-muted">vs ${w.ref.toFixed(2)}</span></span>
                    <span className={cx("num text-right font-semibold", tone(w.gap_bps))}>{p(w.gap_bps)}</span>
                    <a className="text-right text-[13px] text-brand-ink hover:underline" href={`https://solscan.io/tx/${w.sig}`} target="_blank" rel="noreferrer">Transaction</a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="grid gap-4 lg:grid-cols-2">
            {r.dataset && (
              <details className="group h-fit rounded-[10px] border border-line bg-panel">
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[15px] font-semibold">Check these numbers yourself<Chevron /></summary>
                <ol className="list-decimal space-y-2 px-5 pb-5 pl-10 text-[14px] text-ink-2">
                  <li>Download <a className="text-brand-ink hover:underline" href={FILLS_URL} target="_blank" rel="noreferrer">the trade data</a>: {r.dataset.fills.toLocaleString()} trades, each linked to its transaction.</li>
                  <li>Its fingerprint is <code className="num break-all text-[12px] text-ink">{r.dataset.sha256}</code>{r.dataset.commitment_tx && <>, recorded on Solana in <a className="text-brand-ink hover:underline" href={`https://explorer.solana.com/tx/${r.dataset.commitment_tx}?cluster=${r.dataset.cluster}`} target="_blank" rel="noreferrer">this transaction</a></>}.</li>
                  <li>Run <code className="text-[12px] text-ink">node zk/verify-offchain.mjs fills.json</code> from <a className="text-brand-ink hover:underline" href="https://github.com/Clintobi/rehearsal" target="_blank" rel="noreferrer">the code</a> to recompute every figure.</li>
                </ol>
              </details>
            )}
            <details className="group h-fit rounded-[10px] border border-line bg-panel">
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[15px] font-semibold">How trades are graded<Chevron /></summary>
              <ul className="space-y-2 px-5 pb-5 text-[14px] text-ink-2">
                <li>We sample trades on every xStock and PreStocks token as they happen on Solana.</li>
                <li>Each one is compared with the real stock price at that second, from Pyth. Where Pyth has no price on Solana, we use the issuer&apos;s reference price.</li>
                <li>Prices include token fees and stock-split adjustments. Trades under $10 aren&apos;t graded.</li>
                <li>Pyth is a reference price, not the official US best price (the NBBO).</li>
              </ul>
            </details>
          </section>

          <p className="text-[14px] text-muted">
            Want to avoid the bad fills? <Link href="/app" className="font-medium text-brand-ink hover:underline">Check your trade first</Link>.
          </p>
        </>
      )}
    </div>
  );
}
