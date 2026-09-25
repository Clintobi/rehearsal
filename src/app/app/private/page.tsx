"use client";
import { useState } from "react";
import Link from "next/link";
import { useFetch } from "@/lib/hooks";
import type { PreRow } from "@/lib/prestocks";
import type { Passport as PassportData } from "@/lib/agent";
import { compactUsd, pct, price } from "@/lib/format";
import Passport from "@/components/Passport";
import MarketsNav from "@/components/MarketsNav";
import { cx, InfoTip, Notice, Pill, Skeleton, TokenIcon } from "@/components/ui";

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
      <MarketsNav />
      <p className="-mt-2 text-[13.5px] text-muted">
        {rows.length ? <>{rows.length} private companies · <span className="num">{compactUsd(total)}</span> in tokens · 1% fee on every transfer</> : " "}
      </p>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative -mt-4 min-w-0 overflow-x-auto">
          <table className="w-full text-[14px] sm:min-w-[560px]">
            <thead className="border-b border-line text-left text-[12.5px] text-muted">
              <tr>
                <th scope="col" className="py-2.5 pr-3 font-medium">Company</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Token implies</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  <span className="inline-flex items-center gap-1">vs valuation <InfoTip>Token price vs PreStocks&apos; mark, which follows the company&apos;s latest round.</InfoTip></span>
                </th>
                <th scope="col" className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">
                  <span className="inline-flex items-center gap-1">Break-even <InfoTip>Listing value needed to get your money back after the 1% fee in and out.</InfoTip></span>
                </th>
                <th scope="col" className="hidden py-2.5 pl-3 text-right font-medium sm:table-cell">Tokens out</th>
              </tr>
            </thead>
            <tbody>
              {!data && !error && Array.from({ length: 6 }).map((_, i) => <tr key={i} className="border-b border-line"><td colSpan={5} className="py-3"><Skeleton className="h-7 w-full" /></td></tr>)}
              {error && <tr><td colSpan={5} className="py-10 text-center text-muted">Unavailable right now.</td></tr>}
              {rows.map((r) => {
                const on = current?.symbol === r.symbol;
                return (
                  <tr key={r.symbol} aria-selected={on} onClick={() => setSel(r.symbol)}
                    className={cx("cursor-pointer border-b border-line transition-colors hover:bg-surface", on && "bg-surface")}>
                    <td className="py-2.5 pr-3">
                      <button className="flex items-center gap-3 text-left" onClick={() => setSel(r.symbol)}>
                        <TokenIcon src={r.icon} symbol={r.symbol} size={28} />
                        <span>
                          <span className="block font-medium">{r.name}</span>
                          <span className="num block text-[12px] text-muted">{price(r.tokenPrice)}</span>
                        </span>
                      </button>
                    </td>
                    <td className="num px-3 py-2.5 text-right">{compactUsd(r.impliedValuation)}</td>
                    <td className="py-2.5 pl-3 text-right sm:px-3"><Pill tone={premiumTone(r.premiumPct)}>{pct(r.premiumPct, 1)}</Pill></td>
                    <td className="num hidden px-3 py-2.5 text-right sm:table-cell">{compactUsd(r.breakEvenValuation)}</td>
                    <td className="num hidden py-2.5 pl-3 text-right text-muted sm:table-cell">{compactUsd(r.floatUsd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside aria-label="Selected company" className="min-w-0 space-y-8">
          {current ? <Detail row={current} /> : <Skeleton className="h-80 w-full rounded-xl" />}
        </aside>
      </div>
    </div>
  );
}

function Detail({ row }: { row: PreRow }) {
  const { data: pp } = useFetch<PassportData>(`/api/v1/passport?symbol=${row.symbol}&usd=1000`, 120_000);
  const spacex = row.symbol === "SPACEX";
  const { data: cmp } = useFetch<Compare>(spacex ? "/api/compare?company=spacex&usd=1000" : null, 120_000);
  const listed = cmp?.routes?.find((r) => r.kind === "xstock");
  const pre = cmp?.routes?.find((r) => r.kind === "prestock");
  const disc = listed?.impliedValuation && pre?.impliedValuation ? (1 - pre.impliedValuation / listed.impliedValuation) * 100 : null;
  const ppHere = pp && pp.symbol === row.symbol ? pp : null;

  return (
    <>
      <section className="rounded-xl border border-line bg-panel p-5">
        <div className="flex items-center gap-3">
          <TokenIcon src={row.icon} symbol={row.symbol} size={36} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-semibold">{row.name}</h2>
            <p className="num text-[13px] text-muted">{price(row.tokenPrice)} per token</p>
          </div>
          <Pill tone={premiumTone(row.premiumPct)}>{pct(row.premiumPct, 1)}</Pill>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
          <Stat k="Token implies" v={compactUsd(row.impliedValuation)} />
          <Stat k="Valuation" v={compactUsd(row.markValuation)} />
          <Stat k="Break-even" v={compactUsd(row.breakEvenValuation)} />
        </dl>
        {spacex && disc != null && (
          <Notice tone="neutral" className="mt-4">
            Listed SpaceX implies <span className="num font-medium">{compactUsd(listed!.impliedValuation!)}</span>. This token is {Math.abs(disc).toFixed(0)}% {disc > 0 ? "cheaper" : "dearer"}.
          </Notice>
        )}
        <Link href={`/app?t=${row.symbol}`} className="mt-5 flex h-10 items-center justify-center rounded-lg bg-brand text-[14px] font-medium text-on-brand transition-colors hover:bg-brand-hover">
          Trade {row.name}
        </Link>
      </section>
      <Passport p={ppHere} loading={!ppHere} cert={null} />
    </>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-muted">{k}</dt>
      <dd className="num mt-0.5 truncate text-[16px] font-semibold">{v}</dd>
    </div>
  );
}
