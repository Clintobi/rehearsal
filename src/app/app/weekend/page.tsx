"use client";
import { InfoTip, Notice, Pill, Skeleton, TokenIcon, cx } from "@/components/ui";
import MarketsNav from "@/components/MarketsNav";
import { useFetch } from "@/lib/hooks";
import type { Forecast, LenderRisk } from "@/lib/weekend";

type Data = { open: boolean; forecasts: Forecast[]; lenders: LenderRisk[]; studyAt: string; error?: string };

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number, d = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}%`;
const compact = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function Weekend() {
  const { data, error } = useFetch<Data>("/api/weekend", 60_000, 60_000);
  const loading = !data && !error;
  const failed = !!error || !!data?.error;

  return (
    <div className="space-y-10">
      <MarketsNav right={data && !failed ? <Pill tone={data.open ? "good" : "neutral"}>{data.open ? "Market open" : "Market closed"}</Pill> : undefined} />
      {failed && <Notice tone="bad">Weekend data is unavailable right now.</Notice>}

      <section aria-labelledby="open-h">
        <h2 id="open-h" className="flex items-center gap-1.5 text-[15px] font-semibold">
          {data?.open ? "Last weekend" : "Next open"}
          <InfoTip label="How it's calculated">Last close, moved by the token&apos;s move on Solana since the bell. The range covers 8 in 10 past weekends.</InfoTip>
        </h2>
        <div className="mt-3 divide-y divide-line border-y border-line">
          {loading && [0, 1, 2, 3].map((i) => <div key={i} className="py-3.5"><Skeleton className="h-8 w-full" /></div>)}
          {data?.forecasts?.map((f) => (
            <div key={f.symbol} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[auto_10rem_1fr_auto]">
              <TokenIcon src={f.icon} symbol={f.symbol} size={28} />
              <span className="min-w-0 text-[14px] font-medium">{f.ticker}<span className="num block text-[12px] font-normal text-muted">{f.close ? `${data.open ? "Now" : "Close"} ${money(f.close)}` : "No price"}</span></span>
              {data.open ? (
                <span className="col-span-2 row-start-2 text-[13.5px] text-muted sm:col-span-1 sm:row-start-auto">
                  {f.last ? <>Called <span className="num font-medium text-ink">{pct(f.last.forecastPct, 2)}</span> · opened <span className="num font-medium text-ink">{pct(f.last.actualPct, 2)}</span></> : "–"}
                </span>
              ) : (
                <span className="col-span-2 row-start-2 text-[14px] sm:col-span-1 sm:row-start-auto">
                  {f.implied && f.changePct !== null ? (
                    <><span className="num font-semibold">{money(f.implied)}</span>
                      <span className={cx("num ml-2 font-medium", f.changePct >= 0 ? "text-good" : "text-bad")}>{pct(f.changePct, 2)}</span>
                      {f.rangePct !== null && <span className="num ml-2 text-muted">± {f.rangePct.toFixed(1)}%</span>}</>
                  ) : <span className="text-muted">Waiting for token prices</span>}
                </span>
              )}
              <span className="num col-start-3 row-start-1 text-right text-[12.5px] text-muted sm:col-start-auto sm:row-start-auto">
                {f.record.movedWeekends ? <>{f.record.rightDirection}/{f.record.movedWeekends} right</> : null}
                {f.record.medianMissBps !== null && <span className="block">±{(f.record.medianMissBps / 100).toFixed(2)}% typical</span>}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="loans-h">
        <h2 id="loans-h" className="flex items-center gap-1.5 text-[15px] font-semibold">
          Loans on Kamino
          <InfoTip label="About this table">Kamino holds prices at Friday&apos;s close, so the weekend move lands at the open. Limits read from Kamino on-chain; reopenings from the last 2 years.</InfoTip>
        </h2>
        <div className="relative mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-[14px]">
            <thead className="border-b border-line text-left text-[12.5px] text-muted">
              <tr>
                <th scope="col" className="py-2.5 pr-3 font-medium">Collateral</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Limit / liquidation</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Liquidated by</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Opens that bad</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Worst open</th>
                <th scope="col" className="py-2.5 pl-3 text-right font-medium">Safe limit</th>
              </tr>
            </thead>
            <tbody>
              {loading && [0, 1, 2].map((i) => <tr key={i} className="border-b border-line"><td colSpan={6} className="py-3"><Skeleton className="h-7 w-full" /></td></tr>)}
              {data && !failed && !data.lenders?.length && <tr><td colSpan={6} className="py-8 text-center text-muted">Kamino data unavailable.</td></tr>}
              {data?.lenders?.map((l) => (
                <tr key={l.symbol} className="border-b border-line">
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-3">
                      <TokenIcon src={l.icon} symbol={l.symbol} size={28} />
                      <span><span className="block font-medium">{l.ticker}</span><span className="num block text-[12px] text-muted">{compact(l.suppliedUsd)}</span></span>
                    </span>
                  </td>
                  <td className="num px-3 py-2.5 text-right text-muted">{l.maxLtvPct}% / {l.liquidationPct}%</td>
                  <td className="num px-3 py-2.5 text-right font-medium">−{l.dropToLiquidatePct.toFixed(1)}%</td>
                  <td className="num px-3 py-2.5 text-right">
                    {l.mondaysThatFar > 0 ? <Pill tone="warn">{l.mondaysThatFar} of {l.mondays}</Pill> : <span className="text-muted">0 of {l.mondays}</span>}
                  </td>
                  <td className="num px-3 py-2.5 text-right text-muted">{pct(l.worstMondayPct)}<span className="block text-[12px]">{day(l.worstMondayDate)}</span></td>
                  <td className="num py-2.5 pl-3 text-right font-medium">{l.safeLtvPct >= l.maxLtvPct ? `${l.maxLtvPct}%` : `${l.safeLtvPct.toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
