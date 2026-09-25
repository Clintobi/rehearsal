"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Rehearsal } from "@/lib/rehearse";
import { useBoard, useFetch } from "@/lib/hooks";
import { gapTone, pct, price, usd } from "@/lib/format";
import { cx, Logo, Pill, Segmented, Skeleton, ThemeToggle, TokenIcon, toneText } from "@/components/ui";
import Footer from "@/components/Footer";
import type { Forecast } from "@/lib/weekend";

const DEMO = [
  { symbol: "NVDAx", mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", label: "NVIDIA" },
  { symbol: "OPENAI", mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF", label: "OpenAI" },
] as const;

const REPORT_URL = process.env.NEXT_PUBLIC_REPORT_URL ?? "https://gist.githubusercontent.com/Clintobi/7b15feb84f4634fa5ef05eec7e248f9c/raw/report.json";
type ReportLite = { coverage: { fills: number }; overall: { xstocks: { median_gap_bps: number | null; p90_gap_bps: number | null; within_25bps: number | null } } };

const btn = "inline-flex h-11 items-center justify-center rounded-lg px-5 text-[15px] font-medium transition-colors";

export default function Landing() {
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
        <Hero />
        <Ticker />
        <Product />
        <ReportBand />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1fr_440px] lg:gap-20 lg:pb-24 lg:pt-24">
      <div>
        <h1 className="rise text-[clamp(2.4rem,5vw,3.9rem)] font-semibold leading-[1.04] tracking-[-0.035em]">
          Trade tokenized stocks at the real price.
        </h1>
        <p className="rise mt-5 max-w-[44ch] text-[18px] leading-relaxed text-muted [animation-delay:80ms]">
          Every order is checked against the live stock price. Anything worse than fair cancels on-chain.
        </p>
        <div className="rise mt-8 flex flex-wrap gap-3 [animation-delay:140ms]">
          <Link href="/app" className={cx(btn, "bg-brand text-on-brand hover:bg-brand-hover")}>Open app</Link>
          <Link href="/report" className={cx(btn, "border border-line bg-panel text-ink hover:border-line-strong")}>Execution report</Link>
        </div>
        <p className="rise mt-8 text-[13px] text-muted [animation-delay:200ms]">xStocks and PreStocks on Solana. Self-custody, no account.</p>
      </div>
      <div className="rise [animation-delay:100ms]"><LivePreview /></div>
    </section>
  );
}

// The product itself on live data: what a $1,000 buy costs right now.
function LivePreview() {
  const [pick, setPick] = useState<(typeof DEMO)[number]["symbol"]>("NVDAx");
  const [data, setData] = useState<Record<string, Rehearsal>>({});
  useEffect(() => {
    let alive = true;
    DEMO.forEach((d) =>
      fetch(`/api/rehearse?mint=${d.mint}&usd=1000&side=buy`).then((r) => r.json())
        .then((j) => { if (alive && !j.error) setData((m) => ({ ...m, [d.symbol]: j })); })
        .catch(() => {}));
    return () => { alive = false; };
  }, []);
  const r = data[pick];
  const p = r?.premiumPct ?? null;
  const kind = r?.asset.kind ?? (pick === "OPENAI" ? "prestock" : "xstock");
  const tone = gapTone(p, kind);
  const over = r?.overpayUsd ?? null;
  const fair = p != null && Math.abs(p) < 0.25;

  return (
    <figure className="rounded-xl border border-line bg-panel shadow-card" aria-label="Live price check">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <span className="text-[13px] text-muted">Buying $1,000 now</span>
        <div className="w-44"><Segmented size="sm" label="Example stock" value={pick} onChange={setPick} options={DEMO.map((d) => ({ value: d.symbol, label: d.label }))} /></div>
      </div>
      <div className="p-5">
        {!r ? (
          <div className="space-y-3"><Skeleton className="h-9 w-40" /><Skeleton className="h-9 w-4/5" /><Skeleton className="mt-6 h-16 w-full" /></div>
        ) : (
          <div key={pick} className="settle">
            <div className="flex items-center gap-3">
              <TokenIcon src={r.asset.icon} symbol={r.asset.symbol} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium">{r.asset.name}</div>
                <div className="text-[12px] text-muted">{r.asset.symbol}</div>
              </div>
              <Pill tone={fair ? "good" : tone}>{fair ? "Fair price" : kind === "prestock" ? "Above valuation" : tone === "good" ? "Fair price" : "Overpriced"}</Pill>
            </div>
            <p className="mt-5 text-[24px] font-semibold leading-tight">
              {over == null ? `${price(r.fillPrice)} per share` : fair ? "You're getting the real price" : kind === "prestock" ? `${usd(Math.abs(over))} above valuation` : `You'd pay ${usd(Math.abs(over))} more than it's worth`}
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
              <div><dt className="text-[12px] text-muted">You pay</dt><dd className="num mt-0.5 text-[17px] font-semibold">{price(r.fillPrice)}</dd></div>
              <div><dt className="text-[12px] text-muted">{kind === "prestock" ? "Valuation" : "Real price"}</dt><dd className="num mt-0.5 text-[17px] font-semibold">{r.reference ? price(r.reference.price) : "–"}</dd></div>
            </dl>
          </div>
        )}
      </div>
    </figure>
  );
}

function Ticker() {
  const { data: board } = useBoard();
  const rows = (board?.rows ?? []).filter((r) => r.kind === "xstock" && r.premiumPct != null && r.fillPrice).slice(0, 6);
  return (
    <section aria-label="Live prices" className="border-y border-line bg-panel">
      <div className="mx-auto grid max-w-6xl grid-cols-2 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-6">
        {rows.length ? rows.map((r) => (
          <Link key={r.mint} href={`/app?t=${r.symbol}`} className="flex items-center gap-2.5 border-line py-4 pr-4 transition-colors hover:text-brand-ink [&:not(:first-child)]:lg:border-l [&:not(:first-child)]:lg:pl-4">
            <TokenIcon src={r.icon} symbol={r.symbol} size={24} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{r.name}</span>
              <span className="num text-[12.5px] text-muted">{price(r.fillPrice!)} <span className={toneText[gapTone(r.premiumPct, r.kind)]}>{pct(r.premiumPct!, 2)}</span></span>
            </span>
          </Link>
        )) : Array.from({ length: 6 }).map((_, i) => <div key={i} className="py-4 pr-4"><Skeleton className="h-9 w-full" /></div>)}
      </div>
    </section>
  );
}

function Product() {
  return (
    <section className="mx-auto max-w-6xl space-y-24 px-4 py-24 sm:px-6 lg:space-y-32 lg:py-32">
      <Feature title="Protection on every order." body="Set how far from fair you'll go. A worse fill never executes." href="/app" link="Trade">
        <ProtectVisual />
      </Feature>
      <Feature title="Earn on the stocks you hold." body="Weekly premiums on NVDA, TSLA and SPY, settled at Friday's close." href="/app/earn" link="Earn" flip>
        <EarnVisual />
      </Feature>
      <Feature title="Know where Monday opens." body="Weekend token prices, turned into a forecast with a public track record." href="/app/weekend" link="Weekend">
        <WeekendVisual />
      </Feature>
    </section>
  );
}

function Feature({ title, body, href, link, flip, children }: { title: string; body: string; href: string; link: string; flip?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-24">
      <div className={cx(flip && "lg:order-2")}>
        <h2 className="text-[clamp(1.8rem,3.2vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.03em]">{title}</h2>
        <p className="mt-4 max-w-[40ch] text-[17px] leading-relaxed text-muted">{body}</p>
        <Link href={href} className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-medium text-brand-ink hover:underline">
          {link}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      </div>
      <div className={cx("rounded-2xl bg-surface p-6 sm:p-10", flip && "lg:order-1")}>{children}</div>
    </div>
  );
}

function ProtectVisual() {
  return (
    <div className="mx-auto max-w-sm rounded-xl border border-line bg-panel p-5 shadow-card">
      <div className="flex items-center justify-between text-[14px]">
        <span className="font-medium">Price protection</span>
        <span className="relative h-5 w-9 rounded-full bg-brand"><span className="absolute left-0 top-0.5 h-4 w-4 translate-x-[18px] rounded-full bg-white shadow" /></span>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-0.5 rounded-lg bg-surface-2 p-0.5 text-center text-[13px]">
        {["0.25%", "0.50%", "1%", "3%"].map((v) => <span key={v} className={cx("rounded-md py-1.5", v === "0.50%" ? "bg-panel font-medium text-ink shadow-[0_1px_2px_oklch(0_0_0/0.08)]" : "text-muted")}>{v}</span>)}
      </div>
      <p className="num mt-3 text-[13px] text-muted">Cancels if above $225.80</p>
      <div className="mt-5 flex items-start gap-2.5 rounded-lg bg-bad-soft px-3.5 py-3 text-[13.5px]">
        <svg className="mt-px shrink-0 text-bad" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5" strokeWidth="1.4" /><path d="M8 4.8v3.6M8 10.9v.1" /></svg>
        <span className="text-ink">Cancelled: the fill was worse than your limit. Nothing was traded.</span>
      </div>
    </div>
  );
}

function EarnVisual() {
  return (
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
    </div>
  );
}

function WeekendVisual() {
  const { data } = useFetch<{ forecasts: Forecast[] }>("/api/weekend", 300_000);
  const rows = (data?.forecasts ?? []).filter((f) => f.last).slice(0, 4);
  return (
    <div className="mx-auto max-w-sm rounded-xl border border-line bg-panel shadow-card">
      <div className="border-b border-line px-5 py-3 text-[13px] text-muted">Last weekend: called vs opened</div>
      <ul className="divide-y divide-line">
        {rows.length ? rows.map((f) => (
          <li key={f.symbol} className="flex items-center gap-3 px-5 py-3 text-[14px]">
            <TokenIcon src={f.icon} symbol={f.symbol} size={22} />
            <span className="flex-1 font-medium">{f.ticker}</span>
            <span className="num text-muted">{pct(f.last!.forecastPct, 2)}</span>
            <span className="num w-16 text-right font-medium">{pct(f.last!.actualPct, 2)}</span>
          </li>
        )) : [0, 1, 2, 3].map((i) => <li key={i} className="px-5 py-3"><Skeleton className="h-6 w-full" /></li>)}
      </ul>
    </div>
  );
}

function ReportBand() {
  const { data } = useFetch<ReportLite>(REPORT_URL, 300_000);
  const x = data?.overall.xstocks;
  const f = (bps: number | null | undefined) => (bps == null ? "–" : pct(bps / 100));
  return (
    <section className="bg-ink text-bg">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h2 className="text-[clamp(1.8rem,3.2vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.03em]">Every fill, graded in public.</h2>
            <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-bg/70">Real trades on Solana against the real stock price. Bots removed, proven on-chain.</p>
          </div>
          <Link href="/report" className={cx(btn, "bg-bg text-ink hover:opacity-90")}>Read the report</Link>
        </div>
        <dl className="mt-14 grid gap-8 border-t border-bg/15 pt-8 sm:grid-cols-3">
          <div><dt className="text-[13px] text-bg/60">Typical trade</dt><dd className="num mt-1 text-[28px] font-semibold">{x ? f(x.median_gap_bps) : "–"}</dd></div>
          <div><dt className="text-[13px] text-bg/60">Worst 1 in 10</dt><dd className="num mt-1 text-[28px] font-semibold">{x ? f(x.p90_gap_bps) : "–"}</dd></div>
          <div><dt className="text-[13px] text-bg/60">Trades graded</dt><dd className="num mt-1 text-[28px] font-semibold">{data ? data.coverage.fills.toLocaleString() : "–"}</dd></div>
        </dl>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <h2 className="text-[clamp(1.6rem,2.8vw,2.1rem)] font-semibold leading-tight tracking-[-0.03em]">Your next trade, at the real price.</h2>
      <Link href="/app" className={cx(btn, "bg-brand text-on-brand hover:bg-brand-hover")}>Open app</Link>
    </section>
  );
}
