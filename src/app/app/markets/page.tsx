"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useBoard, useFetch, type BoardRow } from "@/lib/hooks";
import { gapTone, pct, price } from "@/lib/format";
import { cx, Pill, Segmented, Skeleton, TokenIcon, toneText } from "@/components/ui";
import MarketsNav from "@/components/MarketsNav";

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
    <th scope="col" className={cx("px-3 py-2.5 font-medium first:pl-0 last:pr-0", className)} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 }))}
        className={cx("inline-flex items-center gap-1 hover:text-ink", sort.key === key && "text-ink")}>
        {label}
        {sort.key === key && <span aria-hidden="true">{sort.dir === 1 ? "↑" : "↓"}</span>}
      </button>
    </th>
  );

  return (
    <div className="space-y-8">
      <MarketsNav right={<HaltsPill />} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-muted">Price for a {board ? `$${board.probeUsd.toLocaleString()}` : "$1,000"} buy vs the real price.</p>
        <div className="w-full sm:w-72">
          <Segmented size="sm" label="Filter" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "xstock", label: "US stocks" }, { value: "prestock", label: "Pre-IPO" }]} />
        </div>
      </div>

      <div className="relative -mt-4 overflow-x-auto">
        <table className="w-full text-[14px] sm:min-w-[640px]">
          <thead className="border-b border-line text-left text-[12.5px] text-muted">
            <tr>
              {th("name", "Stock")}
              {th("price", "Price", "text-right")}
              <th scope="col" className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Real price</th>
              {th("gap", "Difference", "text-right")}
              <th scope="col" className="hidden px-3 py-2.5 pr-0 text-right font-medium sm:table-cell"><span className="sr-only">Status</span></th>
            </tr>
          </thead>
          <tbody>
            {!board && !error && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-line"><td className="py-3" colSpan={5}><Skeleton className="h-7 w-full" /></td></tr>
            ))}
            {error && <tr><td colSpan={5} className="py-10 text-center text-muted">Prices are unavailable right now.</td></tr>}
            {rows.map((r) => {
              const st = statusLabel(r);
              return (
                <tr key={r.mint} className="group border-b border-line transition-colors hover:bg-surface">
                  <td className="py-2.5 pr-3">
                    <Link href={`/app?t=${r.symbol}`} className="flex items-center gap-3">
                      <TokenIcon src={r.icon} symbol={r.symbol} size={28} />
                      <span>
                        <span className="block font-medium">{r.name}</span>
                        <span className="block text-[12px] text-muted">{r.symbol}{r.kind === "xstock" && r.marketOpen === false ? " · Market closed" : ""}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="num px-3 py-2.5 text-right">{r.fillPrice ? price(r.fillPrice) : <span className="text-muted">No route</span>}</td>
                  <td className="num hidden px-3 py-2.5 text-right text-muted sm:table-cell">
                    {r.refPrice ? price(r.refPrice) : "–"}
                    {r.refSource === "Issuer" && <span className="block text-[11px] text-muted">issuer</span>}
                  </td>
                  <td className={cx("num py-2.5 pl-3 text-right font-medium sm:px-3", st ? toneText[st.tone] : "text-muted")}>{r.premiumPct == null ? "–" : pct(r.premiumPct)}</td>
                  <td className="hidden py-2.5 pl-3 text-right sm:table-cell">{st ? <Pill tone={st.tone}>{st.text}</Pill> : <span className="text-[12px] text-muted">No reference</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}

type Halt = { symbol: string; ticker: string; nasdaq: { halted: boolean }; breaker: { state: string; exchangeHalted: boolean } | null };

// Nasdaq halts, mirrored on-chain. Quiet when everything trades; names the stocks when not.
function HaltsPill() {
  const { data } = useFetch<{ rows: Halt[] }>("/api/breakers", 30_000, 60_000);
  if (!data) return null;
  const halted = data.rows.filter((r) => r.nasdaq.halted || r.breaker?.exchangeHalted || (r.breaker && r.breaker.state !== "normal"));
  return halted.length === 0
    ? <Pill tone="good">No halts</Pill>
    : <Pill tone="bad">Halted: {halted.map((h) => h.ticker).join(", ")}</Pill>;
}
