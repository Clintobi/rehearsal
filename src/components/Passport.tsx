"use client";
import type { ReactNode } from "react";
import type { Passport as PassportData } from "@/lib/agent";
import { price, type Tone } from "@/lib/format";
import { InfoTip, Pill, Skeleton } from "./ui";

export type Certificate = {
  signature: string; verified: boolean; succeeded: boolean; symbol: string; side: "buy" | "sell";
  terms: { fairPrice: number; source: string; maxGapBps: number };
  result: { shares: number; usd: number; fillPrice: number | null; gapPct: number | null };
  explain: string;
};

const EVIDENCE: Record<PassportData["evidence"]["level"], { tone: Tone; label: string }> = {
  live: { tone: "good", label: "Live" },
  perp: { tone: "good", label: "24/7 price" },
  issuer: { tone: "warn", label: "Issuer price" },
  mark: { tone: "warn", label: "Valuation" },
  stale: { tone: "bad", label: "Stale" },
  halted: { tone: "bad", label: "Halted" },
};

const short = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`);
const count = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : Math.round(n).toLocaleString());

export function fairLabel(level: PassportData["evidence"]["level"] | undefined) {
  return level === "perp" ? "24/7 price" : level === "mark" ? "Valuation" : level === "issuer" ? "Issuer price" : "Real price";
}

/** What the token is, how its price is known, and whether you can get out. One line each. */
export default function Passport({ p, loading, cert }: { p: PassportData | null; loading: boolean; cert: Certificate | null }) {
  if (!p) {
    return (
      <section aria-busy={loading} aria-label="About this token">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 divide-y divide-line border-y border-line">{[0, 1, 2, 3].map((i) => <div key={i} className="py-3.5"><Skeleton className="h-5 w-full" /></div>)}</div>
      </section>
    );
  }
  const h = p.holds;
  const ev = p.evidence;
  const evs = EVIDENCE[ev.level];
  const backed = h.reserves ? h.reserves.coverage >= 0.995 : null;
  const w = (n: number) => p.exit?.within.find((x) => x.pct === n);
  const one = w(1), two = w(2)?.usd ?? 0;
  const depth: { tone: Tone; label: string } = !p.exit ? { tone: "neutral", label: "Unknown" }
    : two >= 25_000 ? { tone: "good", label: "Deep" } : two >= 2_500 ? { tone: "warn", label: "Moderate" } : { tone: "bad", label: "Thin" };
  const next = h.corporateActions[0];

  return (
    <section aria-labelledby="facts">
      <h2 id="facts" className="text-[15px] font-semibold text-ink">About {p.symbol}</h2>
      <dl className="mt-3 divide-y divide-line border-y border-line">
        <Fact label="Token" tip={<>{h.claim} {h.redeem}<br /><br />{h.risks.join(" ")}</>}
          badge={p.kind === "prestock" ? <Pill tone="warn">Not redeemable</Pill> : backed == null ? null : <Pill tone={backed ? "good" : "bad"}>{backed ? "Fully backed" : "Under-backed"}</Pill>}>
          {h.instrument.split(",")[0]} · {p.issuer}
        </Fact>
        {h.reserves && (
          <Fact label="Reserves">
            <span className="num">{(h.reserves.coverage * 100).toFixed(2)}%</span>
            <span className="text-muted"> · {count(h.reserves.sharesHeld)} shares{h.reserves.custodians.length ? ` at ${h.reserves.custodians.join(", ")}` : ""}</span>
          </Fact>
        )}
        <Fact label="Price source" tip={`${p.market.label}. ${ev.rule}.`} badge={<Pill tone={evs.tone}>{evs.label}</Pill>}>
          {ev.price != null ? <><span className="num">{price(ev.price)}</span><span className="text-muted"> · {ev.source.replace(/^Pyth .*$/, "Pyth")}</span></> : ev.source}
        </Fact>
        <Fact label="Sell depth" tip={p.exit?.largestWallet?.exitableAt5Pct != null ? `The largest wallet holds ${short(p.exit.largestWallet.usd)} and could sell ${p.exit.largestWallet.exitableAt5Pct >= 100 ? "all of it" : `${p.exit.largestWallet.exitableAt5Pct}%`} before the price drops 5%.` : undefined}
          badge={<Pill tone={depth.tone}>{depth.label}</Pill>}>
          {one ? <><span className="num">{one.usd == null ? "Under $100" : `${short(one.usd)}${one.capped ? "+" : ""}`}</span><span className="text-muted"> within 1%</span></> : <span className="text-muted">Not measured</span>}
        </Fact>
        {next && (
          <Fact label="Next event">
            {next.type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())}
            <span className="text-muted"> · {new Date(next.effective).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{next.cashUsd ? ` · $${next.cashUsd}/share` : ""}</span>
          </Fact>
        )}
        {cert && (
          <Fact label="Last trade" badge={<Pill tone={cert.verified ? "good" : "bad"}>{cert.verified ? "Verified" : "Not verified"}</Pill>}>
            <span className="num">{cert.result.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })} {cert.symbol} at {cert.result.fillPrice != null ? price(cert.result.fillPrice) : "–"}</span>
            {" · "}<a className="text-brand-ink hover:underline" href={`/api/v1/certificate?sig=${cert.signature}`} target="_blank" rel="noreferrer">Receipt</a>
          </Fact>
        )}
      </dl>
    </section>
  );
}

function Fact({ label, tip, badge, children }: { label: string; tip?: ReactNode; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3 sm:gap-4">
      <dt className="flex w-24 shrink-0 sm:w-28 items-center gap-1 text-[13px] text-muted">{label}{tip && <InfoTip label={`About ${label.toLowerCase()}`}>{tip}</InfoTip>}</dt>
      <dd className="min-w-0 flex-1 text-[14px] leading-snug text-ink sm:truncate">{children}</dd>
      {badge}
    </div>
  );
}
