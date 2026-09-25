"use client";
import { InfoTip, Pill, Skeleton, TokenIcon, cx } from "@/components/ui";
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

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Weekend</h1>
          <p className="mt-1 max-w-[62ch] text-[15px] text-muted">Where stocks should reopen, read from how their tokens traded while the market was shut. And what a bad open does to loans.</p>
        </div>
        {data && !data.error && <Pill tone={data.open ? "good" : "neutral"}>{data.open ? "Market open" : "Market closed"}</Pill>}
      </header>

      <section aria-labelledby="open-h">
        <div className="flex items-center gap-2">
          <h2 id="open-h" className="text-[18px] font-semibold">{data?.open ? "How last weekend's call went" : "Next open"}</h2>
          <InfoTip label="How this is worked out">
            The stock&apos;s last close, moved by as much as its token has moved on Solana since the bell. The range covers 8 in 10 past weekends. Tokens: main Solana USDC pool. Stocks: official close and open.
          </InfoTip>
        </div>
        <div className="mt-4 overflow-hidden rounded-[10px] border border-line">
          {(error || data?.error) && <p className="px-5 py-4 text-[14px] text-bad">Couldn&apos;t load this right now.</p>}
          {loading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-4 h-10 rounded-lg" />)}
          {data?.forecasts?.map((f) => {
            const hits = f.record.movedWeekends ? `${f.record.rightDirection} of ${f.record.movedWeekends} weekends` : null;
            return (
              <div key={f.symbol} className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 border-b border-line px-5 py-4 last:border-0 sm:grid-cols-[auto_9rem_1fr_auto]">
                <TokenIcon src={f.icon} symbol={f.symbol} size={32} />
                <span className="text-[15px] font-semibold">{f.ticker}<span className="block text-[12px] font-normal text-muted">{f.close ? `${data?.open ? "Now" : "Closed"} ${money(f.close)}` : "No price"}</span></span>
                {data.open ? (
                  <span className="col-span-2 text-[14px] text-ink-2 sm:col-span-1">
                    {f.last ? <>Tokens said <span className="num font-semibold text-ink">{pct(f.last.forecastPct, 2)}</span>, it opened <span className="num font-semibold text-ink">{pct(f.last.actualPct, 2)}</span> on {day(f.last.mon)}</> : "No weekend yet"}
                  </span>
                ) : (
                  <span className="col-span-2 text-[14px] sm:col-span-1">
                    {f.implied && f.changePct !== null ? (
                      <><span className="num text-[17px] font-semibold">{money(f.implied)}</span>
                        <span className={cx("num ml-2 font-semibold", f.changePct >= 0 ? "text-good" : "text-bad")}>{pct(f.changePct, 2)}</span>
                        {f.rangePct !== null && <span className="num ml-2 text-muted">± {f.rangePct.toFixed(1)}%</span>}</>
                    ) : <span className="text-muted">Waiting for token prices since the close</span>}
                  </span>
                )}
                <span className="col-span-2 text-[13px] text-muted sm:col-span-1 sm:text-right">
                  {hits && <>Right direction {hits}</>}
                  {f.record.medianMissBps !== null && <span className="block">Typical miss {(f.record.medianMissBps / 100).toFixed(2)}%</span>}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="loans-h">
        <div className="flex items-center gap-2">
          <h2 id="loans-h" className="text-[18px] font-semibold">Loans against stocks on Kamino</h2>
          <InfoTip label="Where these numbers come from">
            Borrow limits and liquidation levels are read from each Kamino reserve on-chain. Kamino keeps prices at Friday&apos;s close over the weekend, so the whole weekend move lands at the open. Past reopenings: official close to next open, last 2 years.
          </InfoTip>
        </div>
        <p className="mt-1 max-w-[70ch] text-[14px] text-muted">A loan at its limit gets liquidated if the stock opens this much lower.</p>
        <div className="mt-4 overflow-hidden rounded-[10px] border border-line">
          {loading && [0, 1, 2].map((i) => <Skeleton key={i} className="m-4 h-10 rounded-lg" />)}
          {data && !data.lenders?.length && !data.error && <p className="px-5 py-4 text-[14px] text-muted">Kamino&apos;s data isn&apos;t available right now.</p>}
          {data?.lenders?.map((l) => (
            <div key={l.symbol} className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 border-b border-line px-5 py-4 last:border-0 md:grid-cols-[auto_9rem_1fr_1fr_auto]">
              <TokenIcon src={l.icon} symbol={l.symbol} size={32} />
              <span className="text-[15px] font-semibold">{l.ticker}<span className="block text-[12px] font-normal text-muted">{compact(l.suppliedUsd)} deposited</span></span>
              <span className="col-span-2 text-[14px] md:col-span-1">
                <span className="num font-semibold">{l.dropToLiquidatePct.toFixed(1)}% drop</span>
                <span className="block text-[12px] text-muted">Limit {l.maxLtvPct}% · liquidated at {l.liquidationPct}%</span>
              </span>
              <span className="col-span-2 text-[14px] md:col-span-1">
                <span className="num font-semibold">{l.mondaysThatFar} of {l.mondays}</span> <span className="text-muted">reopenings fell that far</span>
                <span className="block text-[12px] text-muted">Worst {pct(l.worstMondayPct)} on {day(l.worstMondayDate)}</span>
              </span>
              <span className="col-span-2 text-[13px] text-ink-2 md:col-span-1 md:text-right">
                {l.safeLtvPct >= l.maxLtvPct ? <>Loans at the limit <span className="font-semibold text-ink">survived all of them</span></> : <>Borrow up to <span className="num font-semibold text-ink">{l.safeLtvPct.toFixed(1)}%</span>
                <span className="block text-[12px] text-muted">to have survived them all</span></>}
              </span>
            </div>
          ))}
        </div>
      </section>

      {data?.studyAt && <p className="text-[12px] text-muted">Track record updated {new Date(data.studyAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Not investment advice.</p>}
    </div>
  );
}
