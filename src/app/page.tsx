"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Rehearsal } from "@/lib/rehearse";
import { useBoard, useFetch } from "@/lib/hooks";
import { compactUsd, gapTone, pct, price, usd } from "@/lib/format";
import { Button, cx, Logo, Pill, Segmented, Skeleton, ThemeToggle, TokenIcon, toneText } from "@/components/ui";
import Footer from "@/components/Footer";

const DEMO = [
  { symbol: "NVDAx", mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", label: "NVIDIA" },
  { symbol: "OPENAI", mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF", label: "OpenAI" },
] as const;

const REPORT_URL = process.env.NEXT_PUBLIC_REPORT_URL ?? "https://gist.githubusercontent.com/Clintobi/7b15feb84f4634fa5ef05eec7e248f9c/raw/report.json";
type ReportLite = { by_size: { key: string; median_gap_bps: number | null; graded: number }[] };

export default function Landing() {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Rehearsal home"><Logo /></Link>
        <nav aria-label="Site" className="hidden items-center gap-1 sm:flex">
          <Link href="/app/markets" className="rounded-full px-3 py-2 text-[14px] font-medium text-muted hover:text-ink">Markets</Link>
          <Link href="/report" className="rounded-full px-3 py-2 text-[14px] font-medium text-muted hover:text-ink">Report</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link href="/app" className="inline-flex h-10 items-center rounded-full bg-brand px-4 text-[14px] font-semibold text-on-brand transition-colors hover:bg-brand-hover">Open app</Link>
        </div>
      </header>

      <main>
        <Hero />
        <LiveLine />
        <HowItWorks />
        <ReportTeaser />
        <Weekend />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

const cta = "inline-flex h-12 items-center rounded-full px-5 text-[15px] font-semibold transition-colors";

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-28 lg:pt-20">
      <div>
        <h1 className="rise text-[clamp(2.5rem,5.6vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
          Buy tokenized stocks at the price they&apos;re actually worth.
        </h1>
        <p className="rise mt-6 max-w-[46ch] text-[18px] leading-relaxed text-ink-2 [animation-delay:90ms]">
          Rehearsal checks your trade against the real stock price before you sign, and cancels it on-chain if the fill comes in worse.
        </p>
        <div className="rise mt-9 flex flex-wrap gap-3 [animation-delay:160ms]">
          <Link href="/app" className={cx(cta, "bg-brand text-on-brand hover:bg-brand-hover")}>Check a trade</Link>
          <Link href="/report" className={cx(cta, "bg-surface-2 text-ink hover:bg-line")}>See how trades are filling</Link>
        </div>
        <p className="rise mt-8 text-[13px] text-muted [animation-delay:220ms]">xStocks and PreStocks on Solana · Prices from Pyth and Jupiter</p>
      </div>
      <div className="rise [animation-delay:120ms]"><LivePreview /></div>
    </section>
  );
}

// The hero image is the product itself, running on live data.
function LivePreview() {
  const [pick, setPick] = useState<(typeof DEMO)[number]["symbol"]>("OPENAI");
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
    <figure className="rounded-[14px] border border-line bg-panel p-5 sm:p-6" aria-label="Live example of a Rehearsal price check">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-muted">Buying $1,000 right now</span>
        <div className="w-48"><Segmented label="Example stock" value={pick} onChange={setPick} options={DEMO.map((d) => ({ value: d.symbol, label: d.label }))} /></div>
      </div>
      {!r ? (
        <div className="mt-6 space-y-3"><Skeleton className="h-6 w-28 rounded-full" /><Skeleton className="h-10 w-4/5" /><Skeleton className="h-5 w-1/2" /><Skeleton className="mt-6 h-16 w-full" /></div>
      ) : (
        <div key={pick} className="settle">
          <div className="mt-6 flex items-center gap-3">
            <TokenIcon src={r.asset.icon} symbol={r.asset.symbol} size={36} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">{r.asset.name}</div>
              <div className="text-[12px] text-muted">{r.asset.symbol} · {kind === "xstock" ? "US stock" : "Pre-IPO"}</div>
            </div>
            <Pill tone={fair ? "good" : tone}>{fair ? "Fair price" : kind === "prestock" ? "Above valuation" : tone === "good" ? "Fair price" : "Overpriced"}</Pill>
          </div>
          <p className="mt-5 text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">
            {over == null ? `${price(r.fillPrice)} per share` : fair ? "You're getting the real price" : kind === "prestock" ? `${usd(Math.abs(over))} above valuation` : `You'd pay ${usd(Math.abs(over))} more than it's worth`}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line">
            <div className="bg-panel p-4">
              <div className="text-[12px] text-muted">You pay per share</div>
              <div className="num mt-1 text-[18px] font-semibold">{price(r.fillPrice)}</div>
            </div>
            <div className="bg-panel p-4">
              <div className="text-[12px] text-muted">{kind === "prestock" ? "Valuation per share" : "Real price"}</div>
              <div className="num mt-1 text-[18px] font-semibold">{r.reference ? price(r.reference.price) : "–"}</div>
            </div>
          </div>
          {kind === "prestock" && r.impliedValuation && r.markValuation && (
            <p className="mt-4 text-[14px] text-ink-2">At this price, {r.asset.name} is valued at <b className="num">{compactUsd(r.impliedValuation)}</b>. PreStocks marks it at <b className="num">{compactUsd(r.markValuation)}</b>.</p>
          )}
          {kind === "xstock" && <p className="mt-4 text-[14px] text-ink-2">Matched against {r.asset.name}&apos;s live price, read on-chain.</p>}
        </div>
      )}
    </figure>
  );
}

function LiveLine() {
  const { data: board } = useBoard();
  const worst = [...(board?.rows ?? [])].filter((r) => r.premiumPct != null && r.fillPrice && r.refPrice).sort((a, b) => Math.abs(b.premiumPct!) - Math.abs(a.premiumPct!))[0];
  return (
    <section className="border-y border-line bg-panel">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {worst ? (
          <p className="max-w-4xl text-[clamp(1.35rem,2.6vw,2rem)] font-medium leading-snug tracking-tight">
            Right now, a ${board!.probeUsd.toLocaleString()} buy of {worst.name}&apos;s token is priced{" "}
            <span className={cx("num font-semibold", toneText[gapTone(worst.premiumPct, worst.kind)])}>{Math.abs(worst.premiumPct!).toFixed(0)}% {worst.premiumPct! > 0 ? "above" : "below"}</span>{" "}
            {worst.kind === "prestock" ? "its own valuation" : "the real stock"}. Most apps won&apos;t show you that.
          </p>
        ) : <Skeleton className="h-10 w-3/4" />}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
      <h2 className="max-w-2xl text-[clamp(1.9rem,3.6vw,2.75rem)] font-semibold leading-tight tracking-[-0.03em]">
        Three things happen before your money moves.
      </h2>
      <div className="mt-16 space-y-20 lg:space-y-28">
        <Step n={1} title="Check" body="See your real fill before you sign: what you'd pay per share, the real price, and the difference in dollars. Token fees and stock splits are already counted.">
          <MiniScale />
        </Step>
        <Step n={2} title="Protect" body="Turn on price protection and the trade runs inside a Solana program that checks the fill against the real price. If it comes in worse than your limit, the whole trade is cancelled." flip>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-[10px] border border-line bg-panel px-4 py-3 text-[14px]">
              <span className="font-medium">Price protection</span>
              <span className="text-muted">Cancel if 5% worse than fair</span>
            </div>
            <div className="rounded-[10px] bg-bad-soft px-4 py-3 text-[14px] text-bad">
              <b className="font-semibold">Stopped.</b> The fill came in 39% over valuation, so nothing was traded.
            </div>
          </div>
        </Step>
        <Step n={3} title="Prove" body="The trades we see on Solana are graded against the real price and published, with the data anyone can check. Brokers have to do this. On-chain venues don't, so we do.">
          <MiniReport />
        </Step>
      </div>
    </section>
  );
}

function Step({ n, title, body, children, flip }: { n: number; title: string; body: string; children: React.ReactNode; flip?: boolean }) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-20">
      <div className={cx(flip && "lg:order-2")}>
        <div className="flex items-baseline gap-3">
          <span className="num text-[15px] font-semibold text-brand-ink">{n}</span>
          <h3 className="text-[26px] font-semibold tracking-tight">{title}</h3>
        </div>
        <p className="mt-3 max-w-[46ch] text-[17px] leading-relaxed text-ink-2">{body}</p>
      </div>
      <div className={cx("rounded-[14px] bg-surface p-5 sm:p-8", flip && "lg:order-1")}>{children}</div>
    </div>
  );
}

function MiniScale() {
  return (
    <div className="rounded-[10px] border border-line bg-panel p-5">
      <div className="flex items-baseline justify-between text-[13px] text-muted"><span>Real price <b className="num text-ink">$224.54</b></span><span>You pay <b className="num text-ink">$224.99</b></span></div>
      <div className="relative mt-4 h-2 rounded-full bg-surface-2">
        <div className="absolute left-[38%] top-0 h-2 w-[18%] rounded-full bg-good/35" />
        <span className="absolute left-[38%] top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-4 ring-panel" />
        <span className="absolute left-[56%] top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-good ring-4 ring-panel" />
      </div>
      <div className="mt-5 flex items-center justify-between">
        <span className="text-[15px] font-semibold">$2.00 more than it&apos;s worth</span>
        <Pill tone="good">Fair price</Pill>
      </div>
    </div>
  );
}

function MiniReport() {
  const { data } = useFetch<ReportLite>(REPORT_URL, 300_000);
  const rows = data?.by_size.filter((r) => r.graded >= 10 && r.median_gap_bps != null) ?? [];
  return (
    <div className="rounded-[10px] border border-line bg-panel">
      <div className="border-b border-line px-4 py-3 text-[13px] text-muted">Typical price paid vs real, by order size</div>
      {rows.length === 0 ? <div className="p-4"><Skeleton className="h-24 w-full" /></div> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between px-4 py-3 text-[14px]">
              <span className="font-medium">{r.key}</span>
              <span className={cx("num font-semibold", r.median_gap_bps! > 100 ? "text-bad" : r.median_gap_bps! > 25 ? "text-warn" : "text-good")}>{pct(r.median_gap_bps! / 100)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportTeaser() {
  const { data } = useFetch<ReportLite>(REPORT_URL, 300_000);
  const small = data?.by_size.find((s) => s.key === "< $100");
  const mid = data?.by_size.find((s) => s.key === "$100–1k");
  const ready = small?.median_gap_bps != null && mid?.median_gap_bps != null && small.graded >= 10 && mid.graded >= 10;
  // Only claim small trades pay more when the data clearly says so.
  const smallPaysMore = ready && small!.median_gap_bps! - mid!.median_gap_bps! >= 10 && small!.median_gap_bps! >= 2 * Math.max(mid!.median_gap_bps!, 1);
  return (
    <section className="bg-ink text-bg">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-24 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:items-end lg:py-28">
        <div>
          <h2 className="text-[clamp(1.9rem,3.6vw,2.75rem)] font-semibold leading-tight tracking-[-0.03em]">
            {smallPaysMore ? "Small trades pay the most." : "Every fill, graded in public."}
          </h2>
          <p className="mt-4 max-w-[48ch] text-[17px] leading-relaxed opacity-80">
            {smallPaysMore
              ? `In the trades we've graded, orders under $100 paid a typical ${pct(small!.median_gap_bps! / 100)} over the real price. Orders of $100 to $1,000 paid ${pct(mid!.median_gap_bps! / 100)}.`
              : "We grade tokenized-stock trades on Solana against the real stock price and publish the results every ten minutes, venue by venue, so you can see where the bad fills happen."}
          </p>
        </div>
        <div className="lg:text-right">
          <Link href="/report" className={cx(cta, "bg-bg px-6 text-ink hover:opacity-90")}>Read the report</Link>
        </div>
      </div>
    </section>
  );
}

function Weekend() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-20">
        <h2 className="text-[clamp(1.9rem,3.6vw,2.75rem)] font-semibold leading-tight tracking-[-0.03em]">The weekend doesn&apos;t get to set your price.</h2>
        <div>
          <p className="text-[17px] leading-relaxed text-ink-2">
            Tokenized stocks trade all weekend. The real stocks don&apos;t, so weekend prices are guesses on thin volume. With a fair order you can wait for Monday instead, and everyone waiting gets filled together at the first real price.
          </p>
          <Link href="/app/orders" className="mt-6 inline-block text-[15px] font-semibold text-brand-ink hover:underline">How orders work</Link>
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="max-w-xl text-[clamp(1.6rem,3vw,2.25rem)] font-semibold leading-tight tracking-[-0.03em]">Check your next trade before you make it.</h2>
        <Link href="/app" className={cx(cta, "bg-brand text-on-brand hover:bg-brand-hover")}>Open app</Link>
      </div>
    </section>
  );
}
