"use client";
import Link from "next/link";
import { useBoard, useFetch } from "@/lib/hooks";
import { gapTone, pct, price } from "@/lib/format";
import { cx, Logo, Pill, Skeleton, ThemeToggle, TokenIcon, toneText } from "@/components/ui";
import Footer from "@/components/Footer";
import type { Forecast } from "@/lib/weekend";

const REPORT_URL = process.env.NEXT_PUBLIC_REPORT_URL ?? "https://gist.githubusercontent.com/Clintobi/7b15feb84f4634fa5ef05eec7e248f9c/raw/report.json";
type ReportLite = { coverage: { fills: number }; overall: { xstocks: { median_gap_bps: number | null; p90_gap_bps: number | null } } };
type Weekend = { open: boolean; forecasts: Forecast[] };

const btn = "inline-flex h-11 items-center justify-center rounded-lg px-5 text-[15px] font-medium transition-colors";
const h2 = "text-[clamp(1.8rem,3.2vw,2.6rem)] font-semibold leading-[1.08] tracking-[-0.03em]";
const Arrow = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

export default function Landing() {
  const { data: wk } = useFetch<Weekend>("/api/weekend", 120_000, 120_000);
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-4 sm:px-6">
          <Link href="/" aria-label="Rehearsal home"><Logo /></Link>
          <nav aria-label="Site" className="hidden items-center gap-6 sm:flex">
            <Link href="/app/markets" className="text-[14px] font-medium text-muted hover:text-ink">Markets</Link>
            <Link href="/app/earn" className="text-[14px] font-medium text-muted hover:text-ink">Earn</Link>
            <Link href="/report" className="text-[14px] font-medium text-muted hover:text-ink">Report</Link>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Link href="/app" className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-[14px] font-medium text-on-brand transition-colors hover:bg-brand-hover">Open app</Link>
          </div>
        </div>
      </header>

      <main>
        <Hero wk={wk} />
        <Ticker />
        <Earn />
        <Markups />
        <TheRest />
        <Trust />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------- hero

function Hero({ wk }: { wk: Weekend | null }) {
  const nv = wk?.forecasts.find((f) => f.symbol === "NVDAx");
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1fr_440px] lg:gap-20 lg:pb-28 lg:pt-24">
      <div>
        <h1 className="rise text-[clamp(2.5rem,5.2vw,4.1rem)] font-semibold leading-[1.02] tracking-[-0.035em]">See Monday&apos;s move on Sunday.</h1>
        <p className="rise mt-5 max-w-[44ch] text-[18px] leading-relaxed text-muted [animation-delay:80ms]">
          Stocks keep trading all weekend as tokens. Rehearsal turns those prices into a forecast of Monday&apos;s open, and shows you how often it&apos;s right.
        </p>
        <div className="rise mt-8 flex flex-wrap gap-3 [animation-delay:140ms]">
          <Link href="/app/weekend" className={cx(btn, "bg-brand text-on-brand hover:bg-brand-hover")}>See this weekend&apos;s forecast</Link>
          <Link href="/app" className={cx(btn, "border border-line bg-panel text-ink hover:border-line-strong")}>Start trading</Link>
        </div>
        <div className="rise mt-8 flex items-start gap-2.5 text-[14px] text-muted [animation-delay:200ms]">
          <span className="relative mt-1.5 flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60 motion-reduce:hidden" /><span className="relative inline-flex h-2 w-2 rounded-full bg-good" /></span>
          {nv?.record.movedWeekends
            ? <p>Called the direction of Nvidia&apos;s Monday open on <b className="num font-semibold text-ink">{nv.record.rightDirection} of the last {nv.record.movedWeekends}</b> weekends. Typical miss <span className="num">{((nv.record.medianMissBps ?? 0) / 100).toFixed(2)}%</span>.</p>
            : <Skeleton className="h-5 w-72" />}
        </div>
      </div>
      <div className="rise [animation-delay:100ms]"><ForecastCard wk={wk} /></div>
    </section>
  );
}

function ForecastCard({ wk }: { wk: Weekend | null }) {
  const rows = (wk?.forecasts ?? []).filter((f) => ["SPYx", "NVDAx", "TSLAx", "QQQx"].includes(f.symbol));
  const live = wk && !wk.open;
  return (
    <figure className="rounded-2xl border border-line bg-panel shadow-card" aria-label={live ? "Monday's open forecast" : "Last weekend's forecast"}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <span className="text-[14px] font-medium">{live ? "Monday's open" : "Last weekend: we called it"}</span>
        <Pill tone={live ? "good" : "neutral"}>{live ? "Live" : "Next: Fri 4 PM ET"}</Pill>
      </div>
      <ul className="divide-y divide-line">
        {!wk && [0, 1, 2, 3].map((i) => <li key={i} className="px-5 py-3.5"><Skeleton className="h-7 w-full" /></li>)}
        {rows.map((f, i) => (
          <li key={f.symbol} className="rise flex items-center gap-3 px-5 py-3.5" style={{ animationDelay: `${160 + i * 60}ms` }}>
            <TokenIcon src={f.icon} symbol={f.symbol} size={28} />
            <span className="flex-1 text-[15px] font-medium">{f.ticker}</span>
            {live ? (
              f.implied && f.changePct != null ? (
                <span className="text-right">
                  <span className="num block text-[15px] font-semibold">{price(f.implied)}</span>
                  <span className={cx("num block text-[12.5px]", f.changePct >= 0 ? "text-good" : "text-bad")}>{pct(f.changePct, 2)}{f.rangePct != null && <span className="text-muted"> ±{f.rangePct.toFixed(1)}%</span>}</span>
                </span>
              ) : <span className="text-[13px] text-muted">Waiting</span>
            ) : f.last ? (
              <span className="grid grid-cols-2 gap-5 text-right">
                <span><span className="block text-[11.5px] text-muted">Called</span><span className="num text-[14px]">{pct(f.last.forecastPct, 2)}</span></span>
                <span><span className="block text-[11.5px] text-muted">Opened</span><span className="num text-[14px] font-semibold">{pct(f.last.actualPct, 2)}</span></span>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </figure>
  );
}

function Ticker() {
  const { data: board } = useBoard();
  const rows = (board?.rows ?? []).filter((r) => r.kind === "xstock" && (r.fillPrice ?? r.refPrice)).slice(0, 6);
  return (
    <section aria-label="Live prices" className="border-y border-line bg-panel">
      <div className="mx-auto grid max-w-6xl grid-cols-2 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-6">
        {rows.length ? rows.map((r) => (
          <Link key={r.mint} href={`/app?t=${r.symbol}`} className="flex items-center gap-2.5 py-4 pr-4 transition-colors hover:text-brand-ink lg:[&:not(:first-child)]:border-l lg:[&:not(:first-child)]:border-line lg:[&:not(:first-child)]:pl-4">
            <TokenIcon src={r.icon} symbol={r.symbol} size={24} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{r.name}</span>
              <span className="num text-[12.5px] text-muted">{price((r.fillPrice ?? r.refPrice)!)}</span>
            </span>
          </Link>
        )) : Array.from({ length: 6 }).map((_, i) => <div key={i} className="py-4 pr-4"><Skeleton className="h-9 w-full" /></div>)}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- earn

function Earn() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-24">
        <div>
          <Pill tone="neutral" className="mb-5">Coming soon</Pill>
          <h2 className={h2}>Earn a weekly premium on Nvidia.</h2>
          <p className="mt-4 max-w-[40ch] text-[17px] leading-relaxed text-muted">Set aside Nvidia, Tesla or the S&amp;P 500 and earn a premium every Friday. About 1% a week, estimated at typical volatility.</p>
          <Link href="/app/earn" className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-medium text-brand-ink hover:underline">Preview Earn<Arrow /></Link>
        </div>
        <div className="rounded-3xl bg-surface p-6 sm:p-12">
          <div className="mx-auto max-w-sm rounded-xl border border-line bg-panel p-5 shadow-card">
            <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-surface-2 p-0.5 text-center text-[13.5px]">
              <span className="rounded-md bg-panel py-1.5 font-medium shadow-[0_1px_2px_oklch(0_0_0/0.08)]">Buy lower</span>
              <span className="py-1.5 text-muted">Sell higher</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-1.5 text-center">
              {[["$218", "−3.1%"], ["$214", "−4.9%"], ["$202", "−10.2%"]].map(([v, d], i) => (
                <span key={v} className={cx("num rounded-md border py-2 text-[13.5px] font-medium", i === 0 ? "border-ink bg-ink text-bg" : "border-line")}>
                  {v}<span className={cx("block text-[11px] font-normal", i === 0 ? "text-bg/70" : "text-muted")}>{d}</span>
                </span>
              ))}
            </div>
            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-[13.5px]">
              <div className="flex justify-between"><dt className="text-muted">You earn</dt><dd className="num font-medium">$6.35</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Return</dt><dd className="num">1.27% in 7 days</dd></div>
            </dl>
            <p className="mt-4 text-center text-[11.5px] text-muted">Example</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- markups

function Markups() {
  const { data: board } = useBoard();
  const rows = [...(board?.rows ?? [])].filter((r) => r.premiumPct != null && r.premiumPct > 1 && r.fillPrice && r.refPrice).sort((a, b) => b.premiumPct! - a.premiumPct!).slice(0, 4);
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:pb-32">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-24">
        <div className="lg:order-2">
          <h2 className={h2}>Never pay the markup.</h2>
          <p className="mt-4 max-w-[42ch] text-[17px] leading-relaxed text-muted">Some stock tokens trade far above the company&apos;s valuation. We show you before you buy, and with protection on, block any fill worse than your limit.</p>
          <Link href="/app/markets" className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-medium text-brand-ink hover:underline">See today&apos;s markups<Arrow /></Link>
        </div>
        <div className="rounded-3xl bg-surface p-6 sm:p-12 lg:order-1">
          <div className="mx-auto max-w-sm overflow-hidden rounded-xl border border-line bg-panel shadow-card">
            {rows.length ? rows.map((r) => (
              <Link key={r.mint} href={`/app?t=${r.symbol}`} className="flex items-center gap-3 border-b border-line px-5 py-3 transition-colors hover:bg-surface">
                <TokenIcon src={r.icon} symbol={r.symbol} size={26} />
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium">{r.name}</span><span className="num block text-[12px] text-muted">{price(r.fillPrice!)} · worth {price(r.refPrice!)}</span></span>
                <span className={cx("num text-[15px] font-semibold", toneText[gapTone(r.premiumPct, r.kind)])}>+{r.premiumPct!.toFixed(0)}%</span>
              </Link>
            )) : [0, 1, 2, 3].map((i) => <div key={i} className="border-b border-line px-5 py-3"><Skeleton className="h-9 w-full" /></div>)}
            <div className="flex items-center justify-between gap-3 bg-surface px-5 py-3.5 text-[13.5px]">
              <span className="font-medium">Price protection</span>
              <span className="flex items-center gap-2.5"><span className="text-muted">Cancels above your limit</span><span aria-hidden="true" className="relative h-5 w-9 shrink-0 rounded-full bg-brand"><span className="absolute left-0 top-0.5 h-4 w-4 translate-x-[18px] rounded-full bg-white shadow" /></span></span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the rest

function TheRest() {
  const items: [string, string, string][] = [
    ["Can I sell it back?", "How much you could sell before the price moves 1%.", "/app"],
    ["What if Monday opens lower?", "The drop that would liquidate your stock loan on Kamino, and how often it's happened.", "/app/weekend"],
    ["Am I paying above the company's value?", "How far OpenAI and SpaceX tokens trade above PreStocks' valuation.", "/app/private"],
  ];
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-28">
        <h2 className={cx(h2, "max-w-[18ch]")}>Your wallet shows the price. We show the rest.</h2>
        <div className="mt-14 grid gap-x-12 gap-y-10 md:grid-cols-3">
          {items.map(([q, a, href]) => (
            <Link key={q} href={href} className="group border-t border-line pt-5">
              <h3 className="text-[18px] font-semibold transition-colors group-hover:text-brand-ink">{q}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{a}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- trust

function Trust() {
  const { data } = useFetch<ReportLite>(REPORT_URL, 300_000);
  const x = data?.overall.xstocks;
  const f = (bps: number | null | undefined) => (bps == null ? "–" : pct(bps / 100));
  return (
    <section className="bg-band text-on-band">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h2 className={h2}>We grade every trade in public.</h2>
            <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-on-band/75">{data ? `${Math.floor(data.coverage.fills / 1000).toLocaleString()},000+` : "Thousands of"} real trades graded against the real stock price, with the raw data published so anyone can check.</p>
          </div>
          <Link href="/report" className={cx(btn, "bg-on-band text-band hover:opacity-90")}>Read the report</Link>
        </div>
        <dl className="mt-14 grid gap-8 border-t border-on-band/15 pt-8 sm:grid-cols-3">
          <div><dt className="text-[13px] text-on-band/70">Typical trade</dt><dd className="num mt-1 text-[28px] font-semibold">{x ? f(x.median_gap_bps) : "–"}</dd></div>
          <div><dt className="text-[13px] text-on-band/70">Worst 1 in 10</dt><dd className="num mt-1 text-[28px] font-semibold">{x ? f(x.p90_gap_bps) : "–"}</dd></div>
          <div><dt className="text-[13px] text-on-band/70">Trades graded</dt><dd className="num mt-1 text-[28px] font-semibold">{data ? data.coverage.fills.toLocaleString() : "–"}</dd></div>
        </dl>
      </div>
    </section>
  );
}

function Faq() {
  const qa: [string, string][] = [
    ["Is this a broker?", "No. You trade from your own wallet. Rehearsal never holds your money."],
    ["What does it cost?", "Checking a price and the forecast are free."],
    ["What can I buy?", "US stocks like Nvidia and Tesla, and pre-IPO names like OpenAI and SpaceX."],
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <dl className="grid gap-10 sm:grid-cols-3">
        {qa.map(([q, a]) => (
          <div key={q}>
            <dt className="text-[16px] font-semibold">{q}</dt>
            <dd className="mt-2 text-[15px] leading-relaxed text-muted">{a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Closing() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-[clamp(1.6rem,2.8vw,2.2rem)] font-semibold leading-tight tracking-[-0.03em]">See Monday before Monday.</h2>
        <Link href="/app" className={cx(btn, "bg-brand text-on-brand hover:bg-brand-hover")}>Open Rehearsal</Link>
      </div>
    </section>
  );
}
