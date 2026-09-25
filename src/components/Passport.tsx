"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import type { Passport as PassportData } from "@/lib/agent";
import { pct, price, type Tone } from "@/lib/format";
import { Pill, Skeleton } from "./ui";

export type Certificate = {
  signature: string; verified: boolean; succeeded: boolean; symbol: string; side: "buy" | "sell";
  terms: { fairPrice: number; source: string; maxGapBps: number };
  result: { shares: number; usd: number; fillPrice: number | null; gapPct: number | null };
  explain: string;
};

const EVIDENCE: Record<PassportData["evidence"]["level"], { tone: Tone; label: string }> = {
  live: { tone: "good", label: "Live price" },
  perp: { tone: "good", label: "24/7 price" },
  issuer: { tone: "warn", label: "Issuer price" },
  mark: { tone: "warn", label: "Valuation only" },
  stale: { tone: "bad", label: "Stale" },
  halted: { tone: "bad", label: "Halted" },
};

const short = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`);
const money = (v: number | null, capped = false) => (v == null ? "under $100" : `${short(v)}${capped ? "+" : ""}`);
const count = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : Math.round(n).toLocaleString());

export function fairLabel(level: PassportData["evidence"]["level"] | undefined) {
  return level === "perp" ? "24/7 price" : level === "mark" ? "Valuation" : level === "issuer" ? "Issuer price" : "Real price";
}

export default function Passport({ p, loading, cert }: { p: PassportData | null; loading: boolean; cert: Certificate | null }) {
  if (!p) {
    return (
      <section aria-busy={loading} className="rounded-[10px] border border-line bg-panel p-5 sm:p-6">
        <Skeleton className="h-5 w-32" />
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="mt-5 h-14 w-full" />)}
      </section>
    );
  }
  const h = p.holds;
  const ev = p.evidence;
  const evs = EVIDENCE[ev.level];
  const backed = h.reserves ? h.reserves.coverage >= 0.995 : null;
  const w = (n: number) => p.exit?.within.find((x) => x.pct === n);
  const two = w(2)?.usd ?? 0;
  const depth: { tone: Tone; label: string } = !p.exit ? { tone: "neutral", label: "Unknown" }
    : two >= 25_000 ? { tone: "good", label: "Deep" } : two >= 2_500 ? { tone: "warn", label: "Moderate" } : { tone: "bad", label: "Thin" };
  const next = h.corporateActions[0];
  const worst = ev.price != null ? ev.price * (1 + (p.side === "buy" ? 1 : -1) * p.protect.maxGapBps / 10_000) : null;

  return (
    <section aria-labelledby="passport" className="rounded-[10px] border border-line bg-panel">
      <header className="flex items-baseline justify-between gap-4 px-5 pt-5 sm:px-6">
        <h2 id="passport" className="text-[17px] font-semibold">Passport</h2>
        <span className="text-[12px] text-muted">{p.symbol} · {p.issuer}</span>
      </header>
      <ul className="mt-2 divide-y divide-line">
        <Row title="What you hold" pill={p.kind === "prestock" ? <Pill tone="warn">Not redeemable</Pill> : backed == null ? null : <Pill tone={backed ? "good" : "bad"}>{backed ? "1:1 backed" : "Under-backed"}</Pill>}>
          <p className="text-[14px] font-medium text-ink">{h.instrument}</p>
          <p className="mt-1 text-[14px] text-ink-2">{h.claim} {h.redeem}</p>
          {h.reserves && (
            <p className="mt-2 text-[13px] text-muted">
              Proof of reserves: {count(h.reserves.sharesHeld)} shares held{h.reserves.custodians.length ? ` at ${h.reserves.custodians.join(", ")}` : ""} for {count(h.reserves.circulating)} tokens ({(h.reserves.coverage * 100).toFixed(2)}%).
            </p>
          )}
          {next && <p className="mt-1 text-[13px] text-muted">Next corporate action: {next.type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()} on {new Date(next.effective).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{next.cashUsd ? `, $${next.cashUsd} per share` : ""}.</p>}
          <details className="group mt-2">
            <summary className="cursor-pointer list-none text-[13px] font-medium text-brand-ink hover:underline">Risks ({h.risks.length})</summary>
            <ul className="mt-2 space-y-1.5 text-[13px] text-ink-2">
              {h.risks.map((r) => <li key={r}>{r}</li>)}
              <li className="text-muted">{h.rights}</li>
            </ul>
          </details>
        </Row>

        <Row title="Price evidence now" pill={<Pill tone={evs.tone}>{evs.label}</Pill>}>
          <p className="text-[14px] text-ink">
            {ev.price != null ? <><span className="num font-semibold">{price(ev.price)}</span> from {ev.source}</> : ev.source}
          </p>
          <p className="mt-1 text-[13px] text-muted">{p.market.label}. {ev.rule}. <Link href="/api/v1/policy" className="text-brand-ink hover:underline">How prices are chosen</Link></p>
        </Row>

        <Row title="Can you get out" pill={<Pill tone={depth.tone}>{depth.label}</Pill>}>
          {p.exit ? (
            <>
              <p className="text-[14px] text-ink">
                You could sell about <b>{money(w(1)?.usd ?? null, w(1)?.capped)}</b> within 1% of the current price, <b>{money(w(2)?.usd ?? null, w(2)?.capped)}</b> within 2% and <b>{money(w(5)?.usd ?? null, w(5)?.capped)}</b> within 5%.
              </p>
              {p.exit.largestWallet && p.exit.largestWallet.exitableAt5Pct != null && (
                <p className="mt-1 text-[13px] text-muted">
                  The largest wallet holds {short(p.exit.largestWallet.usd)}. It could sell {p.exit.largestWallet.exitableAt5Pct >= 100 ? "all of it" : `${p.exit.largestWallet.exitableAt5Pct}% of it`} before the price drops 5%.
                </p>
              )}
            </>
          ) : <p className="text-[14px] text-muted">Couldn&apos;t measure sell depth right now.</p>}
        </Row>

        <Row title="What you paid" pill={cert ? <Pill tone={cert.verified ? "good" : "bad"}>{cert.verified ? "Verified" : "Not verified"}</Pill> : p.protect.available ? <Pill tone="good">Protected</Pill> : <Pill tone="neutral">Unprotected</Pill>}>
          {cert ? (
            <>
              <p className="text-[14px] text-ink">
                {cert.side === "buy" ? "Bought" : "Sold"} <span className="num font-semibold">{cert.result.shares.toLocaleString("en-US", { maximumFractionDigits: 6 })} {cert.symbol}</span> at <span className="num font-semibold">{cert.result.fillPrice != null ? price(cert.result.fillPrice) : "–"}</span>
                {cert.result.gapPct != null && <>, {cert.result.gapPct <= 0 ? `${pct(Math.abs(cert.result.gapPct))} better than` : `${pct(cert.result.gapPct)} vs`} the fair price of <span className="num">{price(cert.terms.fairPrice)}</span></>}.
              </p>
              <p className="mt-1 text-[13px] text-muted">
                The fair price and your floor are written into the transaction, so anyone can check this. <a className="text-brand-ink hover:underline" href={`/api/v1/certificate?sig=${cert.signature}`} target="_blank" rel="noreferrer">Receipt</a> · <a className="text-brand-ink hover:underline" href={`https://solscan.io/tx/${cert.signature}`} target="_blank" rel="noreferrer">Transaction</a>
              </p>
            </>
          ) : p.protect.available && worst != null ? (
            <p className="text-[14px] text-ink-2">
              With protection on, if you&apos;d {p.side === "buy" ? "pay more than" : "get less than"} <span className="num font-semibold text-ink">{price(worst)}</span> a share ({(p.protect.maxGapBps / 100).toFixed(2)}% {p.side === "buy" ? "over" : "under"} {ev.level === "mark" ? "the PreStocks mark, today's premium plus a margin" : "fair value"}), the trade cancels on-chain and nothing moves. You get a receipt either way.
            </p>
          ) : (
            <p className="text-[14px] text-ink-2">Protection is off right now: {ev.rule.toLowerCase()}.</p>
          )}
        </Row>
      </ul>
    </section>
  );
}

function Row({ title, pill, children }: { title: string; pill: ReactNode; children: ReactNode }) {
  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {pill}
      </div>
      <div className="mt-1.5">{children}</div>
    </li>
  );
}
