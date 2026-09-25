"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useBoard, useFetch, type BoardRow } from "@/lib/hooks";
import { compactUsd, gapTone, pct, price } from "@/lib/format";
import { cx, InfoTip, Pill, Segmented, Skeleton, TokenIcon, toneText } from "@/components/ui";

type Filter = "all" | "xstock" | "prestock";
type SortKey = "name" | "gap" | "price";

const statusLabel = (r: BoardRow) => {
  if (r.premiumPct == null) return null;
  const t = gapTone(r.premiumPct, r.kind);
  if (r.kind === "prestock") return { tone: r.premiumPct < -15 ? "warn" as const : t, text: r.premiumPct >= 0 ? (t === "good" ? "Near valuation" : "Above valuation") : "Below valuation" };
  return { tone: t, text: t === "good" ? "Fair" : t === "warn" ? "Pricey" : "Overpriced" };
};

export default function Markets() {
  const { data: board, error } = useBoard();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "gap", dir: -1 });

  const rows = useMemo(() => {
    const list = (board?.rows ?? []).filter((r) => filter === "all" || r.kind === filter);
    const val = (r: BoardRow) => sort.key === "name" ? r.name.toLowerCase() : sort.key === "price" ? r.fillPrice ?? -1 : r.premiumPct == null ? -Infinity : Math.abs(r.premiumPct);
    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [board, filter, sort]);

  const th = (key: SortKey, label: string, className = "") => (
    <th scope="col" className={cx("px-4 py-3 font-medium", className)} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 }))}
        className={cx("inline-flex items-center gap-1 hover:text-ink", sort.key === key && "text-ink")}>
        {label}
        {sort.key === key && <span aria-hidden="true">{sort.dir === 1 ? "↑" : "↓"}</span>}
      </button>
    </th>
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Markets</h1>
          <p className="mt-1 text-[15px] text-muted">What {board ? `$${board.probeUsd.toLocaleString()}` : "$1,000"} actually buys right now, next to the real price.</p>
        </div>
        <div className="w-full sm:w-80">
          <Segmented label="Filter" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "xstock", label: "US stocks" }, { value: "prestock", label: "Pre-IPO" }]} />
        </div>
      </header>

      <div className="overflow-x-auto rounded-[10px] border border-line bg-panel">
        <table className="w-full min-w-[640px] text-[14px]">
          <thead className="border-b border-line text-left text-[13px] text-muted">
            <tr>
              {th("name", "Stock")}
              {th("price", "Your price", "text-right")}
              <th scope="col" className="px-4 py-3 text-right font-medium">Real price</th>
              {th("gap", "Difference", "text-right")}
              <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Status</span></th>
            </tr>
          </thead>
          <tbody>
            {!board && !error && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-line last:border-0"><td className="px-4 py-3" colSpan={5}><Skeleton className="h-7 w-full" /></td></tr>
            ))}
            {error && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">{error}</td></tr>}
            {rows.map((r) => {
              const st = statusLabel(r);
              return (
                <tr key={r.mint} className="group border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/app?t=${r.symbol}`} className="flex items-center gap-3">
                      <TokenIcon src={r.icon} symbol={r.symbol} size={30} />
                      <span>
                        <span className="block font-semibold group-hover:text-brand-ink">{r.name}</span>
                        <span className="block text-[12px] text-muted">{r.symbol}{r.kind === "xstock" && r.marketOpen === false ? " · Market closed" : ""}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="num px-4 py-3 text-right font-medium">{r.fillPrice ? price(r.fillPrice) : <span className="text-muted">No route</span>}</td>
                  <td className="num px-4 py-3 text-right text-ink-2">
                    {r.refPrice ? price(r.refPrice) : "–"}
                    {r.refSource === "Issuer" && <span className="block text-[11px] text-muted" title="No live Pyth price on Solana for this stock, so this is the issuer's reference price.">issuer price</span>}
                  </td>
                  <td className={cx("num px-4 py-3 text-right font-semibold", st ? toneText[st.tone] : "text-muted")}>{r.premiumPct == null ? "–" : pct(r.premiumPct)}</td>
                  <td className="px-4 py-3">{st ? <Pill tone={st.tone}>{st.text}</Pill> : <span className="text-[12px] text-muted">No reference</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <ListedVsPre />
        <Halts />
      </div>
    </div>
  );
}

type Route = { symbol: string; issuer: string; kind: string; mint: string; icon?: string; fill: number | null; impliedValuation: number | null; roundTripPct: number | null; exitFeeBps: number };
type Compare = { name: string; usd: number; routes: Route[] };

function ListedVsPre() {
  const { data } = useFetch<Compare>("/api/compare?company=spacex&usd=1000", 120_000);
  const listed = data?.routes?.find((r) => r.kind === "xstock");
  const pre = data?.routes?.find((r) => r.kind === "prestock");
  const disc = listed?.impliedValuation && pre?.impliedValuation ? (1 - pre.impliedValuation / listed.impliedValuation) * 100 : null;
  return (
    <section aria-labelledby="spacex">
      <h2 id="spacex" className="text-[17px] font-semibold">SpaceX, two ways in</h2>
      <p className="mt-1 text-[14px] text-muted">
        {disc != null ? <>The pre-IPO token prices SpaceX <b className="text-ink">{Math.abs(disc).toFixed(0)}% {disc > 0 ? "below" : "above"}</b> the listed stock. You wait for conversion to get the difference.</> : "Listed stock vs the pre-IPO token."}
      </p>
      <ul className="mt-4 divide-y divide-line rounded-[10px] border border-line bg-panel">
        {[listed, pre].map((r, i) => r ? (
          <li key={r.mint} className="flex items-center gap-3 px-4 py-3">
            <TokenIcon src={r.icon} symbol={r.symbol} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">{r.kind === "xstock" ? "Listed stock" : "Pre-IPO token"}</span>
              <span className="block text-[12px] text-muted">{r.symbol} · {r.issuer}{r.exitFeeBps ? ` · ${r.exitFeeBps / 100}% transfer fee` : ""}</span>
            </span>
            <span className="text-right">
              <span className="num block text-[14px] font-semibold">{r.impliedValuation ? compactUsd(r.impliedValuation) : "–"}</span>
              <span className="num block text-[12px] text-muted">{r.fill ? `${price(r.fill)} / share` : "–"}</span>
            </span>
          </li>
        ) : <li key={i} className="px-4 py-3"><Skeleton className="h-8 w-full" /></li>)}
      </ul>
    </section>
  );
}

type Halt = { symbol: string; ticker: string; nasdaq: { halted: boolean; reason: string | null; at: string | null }; breaker: { address: string; state: string; exchangeHalted: boolean } | null };

function Halts() {
  const { data } = useFetch<{ cluster: string; rows: Halt[] }>("/api/breakers", 30_000, 60_000);
  const halted = data?.rows.filter((r) => r.nasdaq.halted || r.breaker?.exchangeHalted || (r.breaker && r.breaker.state !== "normal")) ?? [];
  return (
    <section aria-labelledby="halts">
      <h2 id="halts" className="flex items-center gap-1.5 text-[17px] font-semibold">
        Trading halts
        <InfoTip>When Nasdaq halts a stock, or its price swings too far too fast, trading of the token pauses on-chain too.</InfoTip>
      </h2>
      <p className="mt-1 text-[14px] text-muted">
        {!data ? "Checking Nasdaq…" : halted.length === 0 ? `All ${data.rows.length} stocks are trading normally.` : `${halted.length} paused right now.`}
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-3">
        {(data?.rows ?? Array.from({ length: 6 }).map(() => null)).map((r, i) => r ? (
          <li key={r.symbol} className="flex items-center justify-between bg-panel px-4 py-3">
            <span className="text-[14px] font-semibold">{r.ticker}</span>
            {r.nasdaq.halted || r.breaker?.exchangeHalted
              ? <Pill tone="bad">Halted</Pill>
              : r.breaker && r.breaker.state !== "normal" ? <Pill tone="warn">Paused</Pill> : <Pill tone="good">Open</Pill>}
          </li>
        ) : <li key={i} className="bg-panel px-4 py-3"><Skeleton className="h-6 w-full" /></li>)}
      </ul>
    </section>
  );
}
