"use client";
import { useEffect, useState } from "react";
import { ago } from "@/lib/format";
import { cx, InfoTip, Notice, PageHeader, Pill, Segmented, Skeleton } from "@/components/ui";

const FILLS_URL = process.env.NEXT_PUBLIC_FILLS_URL ?? "https://gist.githubusercontent.com/Clintobi/7b15feb84f4634fa5ef05eec7e248f9c/raw/fills.json";
const REPORT_URL = process.env.NEXT_PUBLIC_REPORT_URL ?? "https://gist.githubusercontent.com/Clintobi/7b15feb84f4634fa5ef05eec7e248f9c/raw/report.json";

type Summary = { fills: number; graded: number; enough?: boolean; volume_usd: number; median_gap_bps: number | null; p90_gap_bps: number | null; within_25bps: number | null; median_markout_5m_bps: number | null };
type Row = Summary & { key: string };
type Worst = { sig: string; symbol: string; side: string; usd: number; fill: number; ref: number; ref_source: string; gap_bps: number; venue: string; router: string; t: number };
type Report = {
  generated_at: number; started_at: number;
  coverage: { txs_seen: number; txs_sampled: number; fills: number; bot_fills_excluded?: number; bot_wallet_tokens?: number };
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
    const load = () => fetch(`${REPORT_URL}?t=${Date.now()}`, { cache: "no-store" }).then((x) => x.json()).then(setR).catch(() => setErr("unavailable"));
    load();
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, []);

  const x = r?.overall.xstocks;
  const small = r?.by_size.find((s) => s.key === "< $100");
  const mid = r?.by_size.find((s) => s.key === "$100–1k");

  return (
    <div className="space-y-10">
      <div>
        <PageHeader title="Execution report" sub="Real trades on Solana, graded against the real stock price." />
        {r && (
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
            Updated {ago(r.generated_at)} · <span className="num">{r.coverage.fills.toLocaleString()}</span> trades since {new Date(r.started_at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {r.coverage.bot_fills_excluded ? <> · <span className="num">{r.coverage.bot_fills_excluded.toLocaleString()}</span> bot fills excluded <InfoTip label="About excluded fills">Wallets that buy and sell the same token 5+ times each and end near flat are round-tripping. Their fills are removed from every number.</InfoTip></> : null}
          </p>
        )}
      </div>

      {err && <Notice tone="bad">The report is unavailable right now. It refreshes every few minutes.</Notice>}
      {!r && !err && <div className="grid gap-6 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>}

      {r && x && (
        <>
          <dl className="grid divide-line border-y border-line sm:grid-cols-3 sm:divide-x">
            <Metric k="Typical trade, US stocks" v={p(x.median_gap_bps)} cls={tone(x.median_gap_bps)} sub={`${share(x.within_25bps)} within 0.25%`} />
            {small && mid && enough(small) && enough(mid) && (small.median_gap_bps ?? 0) - (mid.median_gap_bps ?? 0) >= 10
              ? <Metric k="Trades under $100" v={p(small.median_gap_bps)} cls={tone(small.median_gap_bps)} sub={`vs ${p(mid.median_gap_bps)} for $100–1k`} />
              : <Metric k="Pre-IPO vs valuation" v={enough(r.overall.prestocks) ? p(r.overall.prestocks.median_gap_bps, 1) : "–"} cls="text-ink" sub={enough(r.overall.prestocks) ? "typical" : "Not enough trades"} />}
            <Metric k="Worst 1 in 10, US stocks" v={p(x.p90_gap_bps)} cls={tone(x.p90_gap_bps)} sub="or worse" />
          </dl>

          <section aria-labelledby="breakdown" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="breakdown" className="text-[15px] font-semibold">Breakdown</h2>
              <div className="w-full sm:w-[380px]">
                <Segmented size="sm" label="Group by" value={group} onChange={setGroup} options={(Object.keys(GROUPS) as GroupKey[]).map((k) => ({ value: k, label: GROUPS[k] }))} />
              </div>
            </div>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[600px] text-[14px]">
                <thead className="border-b border-line text-left text-[12.5px] text-muted">
                  <tr>
                    <th scope="col" className="py-2.5 pr-3 font-medium">{GROUPS[group]}</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Trades</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Volume</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium"><span className="inline-flex items-center gap-1">Typical<InfoTip>Paid vs the real price. Positive means the trader paid more.</InfoTip></span></th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Worst 1 in 10</th>
                    <th scope="col" className="py-2.5 pl-3 text-right font-medium">
                      <span className="inline-flex items-center gap-1">After 5 min<InfoTip>Where the real price went five minutes later.</InfoTip></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...r[group]].sort((a, b) => Number(enough(b)) - Number(enough(a))).map((row) => (
                    <tr key={row.key} className={cx("border-b border-line", !enough(row) && "text-muted")}>
                      <td className="py-2.5 pr-3 font-medium">{row.key}</td>
                      <td className="num px-3 py-2.5 text-right">{row.graded}</td>
                      <td className="num px-3 py-2.5 text-right">{money(row.volume_usd)}</td>
                      {enough(row) ? (
                        <>
                          <td className={cx("num px-3 py-2.5 text-right font-medium", tone(row.median_gap_bps))}>{p(row.median_gap_bps)}</td>
                          <td className={cx("num px-3 py-2.5 text-right", tone(row.p90_gap_bps))}>{p(row.p90_gap_bps)}</td>
                          <td className="num py-2.5 pl-3 text-right text-muted">{p(row.median_markout_5m_bps)}</td>
                        </>
                      ) : <td colSpan={3} className="py-2.5 pl-3 text-right text-[13px]">Too few trades</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {r.worst_fills.some((w) => w.ref_source !== "mark") && (
            <section aria-labelledby="worst" className="space-y-3">
              <h2 id="worst" className="text-[15px] font-semibold">Worst recent fills</h2>
              <ul className="divide-y divide-line border-y border-line">
                {r.worst_fills.filter((w) => w.ref_source !== "mark").slice(0, 8).map((w) => (
                  <li key={w.sig} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2.5 text-[14px] sm:grid-cols-[140px_90px_1fr_80px_auto]">
                    <span className="font-medium">{w.symbol} <span className="font-normal text-muted">{w.side}</span></span>
                    <span className="num text-muted">{money(w.usd)}</span>
                    <span className="num">${w.fill.toFixed(2)} <span className="text-muted">vs ${w.ref.toFixed(2)}</span></span>
                    <span className={cx("num text-right font-medium", tone(w.gap_bps))}>{p(w.gap_bps)}</span>
                    <a className="text-right text-[13px] text-brand-ink hover:underline" href={`https://solscan.io/tx/${w.sig}`} target="_blank" rel="noreferrer">View</a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="proof" className="space-y-3">
            <h2 id="proof" className="text-[15px] font-semibold">Verification</h2>
            <div className="divide-y divide-line border-y border-line text-[14px]">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <Pill tone="good">Proven on Solana</Pill>
                <span className="min-w-0 flex-1 text-muted">Zero-knowledge proof of these grades, verified on-chain.</span>
                <a className="font-medium text-brand-ink hover:underline" href="https://explorer.solana.com/tx/xWLNrsazKgyC2xADjP3nUACbvqzTYTBrfdDvPtAYtZTtvFH8UWGZkyEHBw4kjqEqfyriJcgRBrteJLfqAkNsJQk?cluster=devnet" target="_blank" rel="noreferrer">View proof</a>
              </div>
              {r.dataset && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="font-medium">Dataset</span>
                  <code className="num min-w-0 flex-1 truncate text-[12.5px] text-muted">{r.dataset.sha256}</code>
                  <a className="font-medium text-brand-ink hover:underline" href={FILLS_URL} target="_blank" rel="noreferrer">Download</a>
                  {r.dataset.commitment_tx && <a className="font-medium text-brand-ink hover:underline" href={`https://explorer.solana.com/tx/${r.dataset.commitment_tx}?cluster=${r.dataset.cluster}`} target="_blank" rel="noreferrer">On-chain hash</a>}
                </div>
              )}
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between py-3 font-medium">Method<Chevron /></summary>
                <ul className="space-y-1.5 pb-4 text-muted">
                  <li>Trades on every xStock and PreStocks token, sampled as they happen on Solana.</li>
                  <li>Compared with Pyth&apos;s price at that second, or the issuer&apos;s price where Pyth has none.</li>
                  <li>Token fees and share multipliers included. Trades under $10 excluded.</li>
                  <li>Pyth is a reference price, not the official NBBO.</li>
                </ul>
              </details>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ k, v, sub, cls }: { k: string; v: string; sub?: string; cls: string }) {
  return (
    <div className="py-5 sm:px-6 sm:first:pl-0">
      <dt className="text-[12.5px] text-muted">{k}</dt>
      <dd className={cx("num mt-1 text-[26px] font-semibold", cls)}>{v}</dd>
      {sub && <dd className="text-[12.5px] text-muted">{sub}</dd>}
    </div>
  );
}
