"use client";
import { useState } from "react";
import Link from "next/link";
import { useFetch } from "@/lib/hooks";
import type { PreRow } from "@/lib/prestocks";
import type { Passport as PassportData } from "@/lib/agent";
import { compactUsd, pct, price } from "@/lib/format";
import Passport from "@/components/Passport";
import { cx, InfoTip, Pill, Skeleton, TokenIcon } from "@/components/ui";

type Board = { rows: PreRow[]; transferFeeBps: number; at: number };
type Route = { kind: string; symbol: string; impliedValuation: number | null; fill: number | null };
type Compare = { routes: Route[] };

const premiumTone = (p: number) => (p > 15 ? "bad" : p > 5 ? "warn" : p < -15 ? "warn" : "good") as "bad" | "warn" | "good";

export default function PreIpo() {
  const { data, error } = useFetch<Board>("/api/v1/prestocks", 60_000, 60_000);
  const [sel, setSel] = useState<string | null>(null);
  const rows = data?.rows ?? [];
  const current = rows.find((r) => r.symbol === sel) ?? rows[0];
  const total = rows.reduce((s, r) => s + r.floatUsd, 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight">Pre-IPO</h1>
        <p className="mt-1 max-w-[68ch] text-[15px] text-muted">
          Private companies, tokenized by PreStocks. What each token&apos;s price says the company is worth, next to PreStocks&apos; own valuation, and what it would have to list at for you to break even.
        </p>
        {rows.length > 0 && (
          <p className="mt-3 text-[14px] text-ink-2">
            {rows.length} companies, <b>{compactUsd(total)}</b> of tokens in total. Every transfer pays a 1% fee, so a round trip costs at least 2%.
          </p>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_440px]">
        <div className="min-w-0 overflow-x-auto rounded-[10px] border border-line bg-panel">
          <table className="w-full min-w-[600px] text-[14px]">
            <thead className="border-b border-line text-left text-[13px] text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Company</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Token values it at</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1">vs valuation <InfoTip>How far the token&apos;s market price is above or below PreStocks&apos; mark, which is based on the company&apos;s latest valuation.</InfoTip></span>
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  <span className="inline-flex items-center gap-1">Break-even listing <InfoTip>The company value at a listing that gets a buyer at today&apos;s token price back to even after the 1% fee in and the 1% fee out. Spread is extra.</InfoTip></span>
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Tokens out</th>
              </tr>
            </thead>
            <tbody>
              {!data && !error && Array.from({ length: 6 }).map((_, i) => <tr key={i} className="border-b border-line last:border-0"><td colSpan={5} className="px-4 py-3"><Skeleton className="h-7 w-full" /></td></tr>)}
              {error && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">{error}</td></tr>}
              {rows.map((r) => {
                const on = current?.symbol === r.symbol;
                return (
                  <tr key={r.symbol} aria-selected={on} onClick={() => setSel(r.symbol)}
                    className={cx("cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface", on && "bg-surface")}>
                    <td className="px-4 py-3">
                      <button className="flex items-center gap-3 text-left" onClick={() => setSel(r.symbol)}>
                        <TokenIcon src={r.icon} symbol={r.symbol} size={30} />
                        <span>
                          <span className="block font-semibold">{r.name}</span>
                          <span className="block text-[12px] text-muted">{r.symbol} · {price(r.tokenPrice)}</span>
                        </span>
                      </button>
                    </td>
                    <td className="num px-4 py-3 text-right font-medium">{compactUsd(r.impliedValuation)}<span className="block text-[12px] font-normal text-muted">mark {compactUsd(r.markValuation)}</span></td>
                    <td className="px-4 py-3 text-right"><Pill tone={premiumTone(r.premiumPct)}>{pct(r.premiumPct, 1)}</Pill></td>
                    <td className="num px-4 py-3 text-right">{compactUsd(r.breakEvenValuation)}</td>
                    <td className="num px-4 py-3 text-right text-ink-2">{compactUsd(r.floatUsd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside aria-label="Selected company" className="min-w-0 space-y-4">
          {current ? <Detail row={current} /> : <Skeleton className="h-96 w-full rounded-[10px]" />}
        </aside>
      </div>
    </div>
  );
}

function Detail({ row }: { row: PreRow }) {
  const { data: pp, error } = useFetch<PassportData>(`/api/v1/passport?symbol=${row.symbol}&usd=1000`, 120_000);
  const spacex = row.symbol === "SPACEX";
  const { data: cmp } = useFetch<Compare>(spacex ? "/api/compare?company=spacex&usd=1000" : null, 120_000);
  const listed = cmp?.routes?.find((r) => r.kind === "xstock");
  const pre = cmp?.routes?.find((r) => r.kind === "prestock");
  const disc = listed?.impliedValuation && pre?.impliedValuation ? (1 - pre.impliedValuation / listed.impliedValuation) * 100 : null;
  const ppHere = pp && pp.symbol === row.symbol ? pp : null;

  return (
    <>
      <section className="rounded-[10px] border border-line bg-panel p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <TokenIcon src={row.icon} symbol={row.symbol} size={36} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold">{row.name}</h2>
            <p className="text-[13px] text-muted">{row.symbol} on PreStocks</p>
          </div>
          <Link href={`/app?t=${row.symbol}`} className="inline-flex h-9 items-center rounded-full bg-brand px-4 text-[14px] font-semibold text-on-brand transition-colors hover:bg-brand-hover">Buy protected</Link>
        </div>
        <p className="mt-4 text-[15px] text-ink-2">
          At <span className="num font-semibold text-ink">{price(row.tokenPrice)}</span> the token values {row.name} at <b className="text-ink">{compactUsd(row.impliedValuation)}</b>, {row.premiumPct >= 0 ? `${row.premiumPct.toFixed(1)}% above` : `${Math.abs(row.premiumPct).toFixed(1)}% below`} PreStocks&apos; {compactUsd(row.markValuation)} mark.
          {" "}To get your money back after the fees, {row.name} would need to list at about <b className="text-ink">{compactUsd(row.breakEvenValuation)}</b> or more{ppHere?.fill.roundTripCostPct != null ? `, plus the ${ppHere.fill.roundTripCostPct.toFixed(1)}% it costs to buy and sell back today` : ""}.
        </p>
        {spacex && disc != null && (
          <p className="mt-3 rounded-lg bg-surface px-4 py-3 text-[14px] text-ink-2">
            SpaceX is already listed. The listed stock prices it at <b className="text-ink">{compactUsd(listed!.impliedValuation!)}</b>, the pre-IPO token at <b className="text-ink">{compactUsd(pre!.impliedValuation!)}</b>: {Math.abs(disc).toFixed(0)}% {disc > 0 ? "cheaper" : "dearer"}, because you wait for the token&apos;s conversion.
          </p>
        )}
      </section>
      {error ? <p className="text-[14px] text-muted">The passport couldn&apos;t load right now.</p> : <Passport p={ppHere} loading={!ppHere} cert={null} />}
    </>
  );
}
