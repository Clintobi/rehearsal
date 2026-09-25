"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import type { Rehearsal } from "@/lib/rehearse";
import { useAssets, useBoard, type AssetOpt } from "@/lib/hooks";
import { compactUsd, gapTone, pct, price, shortAddr, usd, type Tone } from "@/lib/format";
import { Button, cx, InfoTip, Pill, Segmented, Skeleton, TokenIcon, toneText } from "@/components/ui";

const GUARD_LIVE = process.env.NEXT_PUBLIC_GUARD_LIVE === "1";
const GUARD_ID = process.env.NEXT_PUBLIC_GUARD_PROGRAM_ID ?? "TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE";
const b64ToBytes = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const bytesToB64 = (u: Uint8Array) => btoa(Array.from(u, (c) => String.fromCharCode(c)).join(""));

export default function TradePage() {
  return <Suspense><Trade /></Suspense>;
}

function Trade() {
  const params = useSearchParams();
  const { data: assets } = useAssets();
  const { data: board } = useBoard();
  const [mint, setMint] = useState<string>("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("1000");
  const [result, setResult] = useState<Rehearsal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const req = useRef(0);

  // Pick the token from ?t=SYMBOL, else NVDAx.
  useEffect(() => {
    if (!assets?.length || mint) return;
    const want = params?.get("t")?.toLowerCase();
    const pick = assets.find((a) => a.symbol.toLowerCase() === want) ?? assets.find((a) => a.symbol === "NVDAx") ?? assets[0];
    const t = setTimeout(() => setMint(pick.mint), 0);
    return () => clearTimeout(t);
  }, [assets, params, mint]);

  const asset = assets?.find((a) => a.mint === mint);
  const usdAmount = Number(amount);

  // Live quote: re-quote shortly after the inputs settle, then every 20 seconds.
  useEffect(() => {
    if (!mint || !(usdAmount > 0)) return;
    const id = ++req.current;
    const run = async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/rehearse?mint=${mint}&usd=${usdAmount}&side=${side}`);
        const j = await r.json();
        if (id !== req.current) return;
        if (j.error) { setError(j.error); setResult(null); } else { setResult(j); setError(null); }
      } catch {
        if (id === req.current) setError("Couldn't reach the quote service. Check your connection.");
      } finally {
        if (id === req.current) setLoading(false);
      }
    };
    const t = setTimeout(run, 450);
    const every = setInterval(run, 20_000);
    return () => { clearTimeout(t); clearInterval(every); };
  }, [mint, usdAmount, side]);

  const others = useMemo(() => (board?.rows ?? []).filter((r) => r.premiumPct != null && r.mint !== mint).slice(0, 6), [board, mint]);

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr] lg:gap-8">
      <section aria-label="Order" className="h-fit rounded-[10px] border border-line bg-panel p-5 sm:p-6 lg:sticky lg:top-24">
        <h1 className="text-[22px] font-semibold tracking-tight">Trade</h1>
        <div className="mt-5 space-y-5">
          <TokenPicker assets={assets} value={mint} onChange={(m) => { setMint(m); setResult(null); }} board={board?.rows} />
          <Segmented label="Side" value={side} onChange={setSide} options={[{ value: "buy", label: "Buy" }, { value: "sell", label: "Sell" }]} />
          <div>
            <label htmlFor="amount" className="text-[13px] font-medium text-muted">{side === "buy" ? "Amount to spend" : "Amount to sell"}</label>
            <div className="mt-2 flex items-center rounded-lg border border-line bg-surface px-4 focus-within:border-brand">
              <span className="text-[28px] font-semibold text-muted">$</span>
              <input id="amount" inputMode="decimal" autoComplete="off" value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 9))}
                className="num w-full bg-transparent px-1 py-3 text-[28px] font-semibold tracking-tight outline-none" />
              <span className="text-[13px] font-medium text-muted">USDC</span>
            </div>
            <div className="mt-2 flex gap-2">
              {[100, 500, 1000, 5000].map((v) => (
                <button key={v} onClick={() => setAmount(String(v))}
                  className={cx("num rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                    Number(amount) === v ? "border-ink text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink")}>
                  ${v.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="min-w-0 space-y-6">
        <Verdict result={result} asset={asset} loading={loading && !result} error={error} stale={loading && !!result} />
        {others.length > 0 && (
          <section aria-labelledby="others">
            <div className="flex items-baseline justify-between">
              <h2 id="others" className="text-[15px] font-semibold">Other prices right now</h2>
              <Link href="/app/markets" className="text-[13px] font-medium text-brand-ink hover:underline">All markets</Link>
            </div>
            <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
              {others.map((r) => {
                const tone = gapTone(r.premiumPct, r.kind);
                return (
                  <li key={r.mint}>
                    <button onClick={() => { setMint(r.mint); setSide("buy"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface">
                      <TokenIcon src={r.icon} symbol={r.symbol} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">{r.name}</span>
                        <span className="block text-[12px] text-muted">{r.symbol}</span>
                      </span>
                      <span className="num text-right text-[14px] font-medium">{r.fillPrice ? price(r.fillPrice) : "–"}</span>
                      <span className={cx("num w-20 text-right text-[13px] font-semibold", toneText[tone])}>{pct(r.premiumPct!, 1)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- token picker

function TokenPicker({ assets, value, onChange, board }: { assets: AssetOpt[] | null; value: string; onChange: (m: string) => void; board?: { mint: string; premiumPct: number | null; kind: string }[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = assets?.find((a) => a.mint === value);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const list = (assets ?? []).filter((a) => `${a.symbol} ${a.name}`.toLowerCase().includes(q.toLowerCase()));
  const groups = [
    { title: "US stocks", items: list.filter((a) => a.kind === "xstock") },
    { title: "Pre-IPO", items: list.filter((a) => a.kind === "prestock") },
  ];

  return (
    <div ref={ref} className="relative">
      <span className="text-[13px] font-medium text-muted">Stock</span>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox"
        className="mt-2 flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-line-strong">
        {selected ? <TokenIcon src={selected.icon} symbol={selected.symbol} size={36} /> : <Skeleton className="h-9 w-9 rounded-full" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">{selected?.name ?? "Loading…"}</span>
          <span className="block text-[13px] text-muted">{selected ? `${selected.symbol} · ${selected.kind === "xstock" ? "US stock" : "Pre-IPO"}` : " "}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-[var(--z-dropdown)] mt-2 overflow-hidden rounded-lg border border-line bg-bg shadow-card">
          <div className="border-b border-line p-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stocks"
              className="w-full rounded-xl bg-surface-2 px-3 py-2 text-[14px] outline-none placeholder:text-muted" />
          </div>
          <div role="listbox" className="max-h-80 overflow-y-auto p-1">
            {groups.map((g) => g.items.length > 0 && (
              <div key={g.title}>
                <div className="px-3 pb-1 pt-3 text-[12px] font-semibold text-muted">{g.title}</div>
                {g.items.map((a) => {
                  const row = board?.find((b) => b.mint === a.mint);
                  const tone = gapTone(row?.premiumPct, a.kind);
                  return (
                    <button key={a.mint} role="option" aria-selected={a.mint === value}
                      onClick={() => { onChange(a.mint); setOpen(false); setQ(""); }}
                      className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-2", a.mint === value && "bg-surface-2")}>
                      <TokenIcon src={a.icon} symbol={a.symbol} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{a.name}</span>
                        <span className="block text-[12px] text-muted">{a.symbol}</span>
                      </span>
                      {row?.premiumPct != null && <span className={cx("num text-[12px] font-semibold", toneText[tone])}>{pct(row.premiumPct, 1)}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            {list.length === 0 && <p className="px-3 py-6 text-center text-[14px] text-muted">No stock matches “{q}”.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- verdict

function headline(r: Rehearsal): { tone: Tone; label: string; title: string; sub?: string } {
  const p = r.premiumPct;
  const buy = r.side === "buy";
  const kind = r.asset.kind;
  if (p == null || r.overpayUsd == null) return { tone: "neutral", label: "No reference", title: `${price(r.fillPrice)} per share`, sub: "There's no independent price for this token yet, so check the size of your order carefully." };
  const tone = gapTone(p, kind);
  const diff = Math.abs(r.overpayUsd);
  if (kind === "prestock") {
    const above = p >= 0;
    return {
      tone: above ? tone : p < -15 ? "warn" : "good",
      label: above ? (tone === "bad" ? "Well above valuation" : tone === "warn" ? "Above valuation" : "Near valuation") : "Below valuation",
      title: `${usd(diff)} ${above ? "above" : "below"} ${r.asset.name}'s valuation`,
      sub: r.impliedValuation && r.markValuation ? `At this price you're valuing ${r.asset.name} at ${compactUsd(r.impliedValuation)}. PreStocks marks it at ${compactUsd(r.markValuation)}.` : undefined,
    };
  }
  if (Math.abs(p) < 0.15 || diff < 0.5) return { tone: "good", label: "Fair price", title: "You're getting the real price", sub: `Within ${usd(Math.max(diff, 0.01))} of ${r.asset.name}'s live price.` };
  if (p < 0) return { tone: "good", label: "Better than fair", title: buy ? `${usd(diff)} cheaper than the real stock` : `${usd(diff)} more than the real stock`, sub: `You're ${buy ? "paying less" : "getting more"} than ${r.asset.name}'s live price.` };
  return {
    tone,
    label: tone === "bad" ? "Overpriced" : tone === "warn" ? "A little pricey" : "Fair price",
    title: buy ? `You'd pay ${usd(diff)} more than it's worth` : `You'd get ${usd(diff)} less than it's worth`,
    sub: `${pct(p)} vs ${r.asset.name}'s live price.`,
  };
}

function notes(r: Rehearsal): string[] {
  const out: string[] = [];
  const m = r.reference?.market;
  if (m && !m.open && r.asset.kind === "xstock") {
    out.push(
      m.label.startsWith("Pre-market") ? "It's pre-market, so the real price comes from early trading. Prices can move at the 9:30 open."
      : m.label.startsWith("After hours") ? "It's after hours, so the real price comes from late trading. Prices can move by the next open."
      : m.label.startsWith("Weekend") ? "The US market is closed for the weekend, so the real price is Friday's. Prices can jump on Monday."
      : m.label.includes("holiday") ? "The US market is closed for a holiday, so the real price is from the last trading day."
      : "The US market is closed, so the real price is from the last trade. Prices can jump at the open.",
    );
  }
  if ((r.sizeImpactPct ?? 0) > 1) out.push(`Your order size moves the price ${r.sizeImpactPct!.toFixed(1)}%. A smaller order would fill better.`);
  if ((r.roundTripCostPct ?? 0) > 2) out.push(`Selling straight back would lose ${r.roundTripCostPct!.toFixed(1)}%. Liquidity is thin.`);
  return out;
}

function Verdict({ result: r, asset, loading, error, stale }: { result: Rehearsal | null; asset?: AssetOpt; loading: boolean; error: string | null; stale: boolean }) {
  if (error && !r) {
    return (
      <section className="rounded-[10px] border border-line bg-panel p-6">
        <Pill tone="neutral">Quote unavailable</Pill>
        <p className="mt-3 text-[15px] text-ink-2">{error}</p>
      </section>
    );
  }
  if (loading || !r) {
    return (
      <section aria-busy="true" className="rounded-[10px] border border-line bg-panel p-6">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="mt-4 h-9 w-3/4" />
        <Skeleton className="mt-2 h-5 w-1/2" />
        <Skeleton className="mt-8 h-14 w-full rounded-lg" />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      </section>
    );
  }
  const h = headline(r);
  const ref = r.reference;
  return (
    <section aria-live="polite" className={cx("rounded-[10px] border border-line bg-panel p-5 transition-opacity duration-200 sm:p-7", stale && "opacity-70")}>
      <div className="flex items-center gap-3">
        <TokenIcon src={asset?.icon ?? r.asset.icon} symbol={r.asset.symbol} size={28} />
        <span className="text-[14px] font-medium text-muted">{r.side === "buy" ? "Buying" : "Selling"} <span className="num">{usd(r.usd)}</span> of {r.asset.symbol}</span>
        <span className="ml-auto"><Pill tone={h.tone}>{h.label}</Pill></span>
      </div>
      <h2 key={h.title} className="settle mt-5 text-[26px] font-semibold leading-tight tracking-tight sm:text-[32px]">{h.title}</h2>
      {h.sub && <p className="mt-2 max-w-[60ch] text-[15px] text-ink-2">{h.sub}</p>}

      {ref && <PriceScale fill={r.fillPrice} fair={ref.price} tone={h.tone} fairLabel={r.asset.kind === "prestock" ? "Valuation" : "Real price"} side={r.side} />}

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Stat label={r.side === "buy" ? "You pay per share" : "You get per share"} value={price(r.fillPrice)} />
        <Stat label={r.asset.kind === "prestock" ? "PreStocks valuation" : "Real price"} value={ref ? price(ref.price) : "–"}
          tip={r.asset.kind === "prestock" ? "PreStocks' mark for the private company, based on its latest funding data." : "Live price of the actual share, read on-chain from Pyth."} />
        <Stat label="You receive" value={`${r.tokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${r.asset.symbol}`} />
      </dl>

      {notes(r).length > 0 && (
        <ul className="mt-6 space-y-2">
          {notes(r).map((n) => (
            <li key={n} className="flex gap-2 text-[14px] text-ink-2">
              <svg className="mt-0.5 shrink-0 text-warn" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.25" /><path d="M8 5v3.5M8 11v.2" /></svg>
              {n}
            </li>
          ))}
        </ul>
      )}

      <Details r={r} />
      <Execute r={r} tone={h.tone} />
    </section>
  );
}

function Stat({ label, value, tip }: { label: string; value: string; tip?: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[13px] text-muted">{label}{tip && <InfoTip>{tip}</InfoTip>}</dt>
      <dd className="num mt-1 text-[17px] font-semibold">{value}</dd>
    </div>
  );
}

// Where your price sits against the real one.
function PriceScale({ fill, fair, tone, fairLabel, side }: { fill: number; fair: number; tone: Tone; fairLabel: string; side: "buy" | "sell" }) {
  const lo = Math.min(fill, fair), hi = Math.max(fill, fair);
  const pad = Math.max((hi - lo) * 0.6, fair * 0.004);
  const min = lo - pad, max = hi + pad;
  const x = (v: number) => ((v - min) / (max - min)) * 100;
  const color = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : "var(--good)";
  const [a, b] = [x(Math.min(fill, fair)), x(Math.max(fill, fair))];
  return (
    <figure className="mt-7" aria-label={`Your price ${price(fill)} against ${fairLabel.toLowerCase()} ${price(fair)}`}>
      <div className="relative h-14">
        <div className="absolute inset-x-0 top-6 h-1.5 rounded-full bg-surface-2" />
        <div className="absolute top-6 h-1.5 rounded-full transition-[left,width] duration-300 ease-out" style={{ left: `${a}%`, width: `${Math.max(b - a, 0.6)}%`, background: color, opacity: 0.35 }} />
        <Marker x={x(fair)} label={fairLabel} value={price(fair)} className="bg-ink" top />
        <Marker x={x(fill)} label={side === "buy" ? "You pay" : "You get"} value={price(fill)} style={{ background: color }} />
      </div>
    </figure>
  );
}
function Marker({ x, label, value, className, style, top }: { x: number; label: string; value: string; className?: string; style?: React.CSSProperties; top?: boolean }) {
  const align = x < 18 ? "left-0" : x > 82 ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <div className="absolute top-0 h-full transition-[left] duration-300 ease-out" style={{ left: `${x}%` }}>
      <span className={cx("absolute top-[18px] h-4 w-4 -translate-x-1/2 rounded-full ring-4 ring-bg", className)} style={style} />
      <span className={cx("num absolute whitespace-nowrap text-[12px] text-muted", align, top ? "-top-1" : "top-10")} style={{ transform: align.includes("translate") ? undefined : undefined }}>
        {label} <b className="font-semibold text-ink">{value}</b>
      </span>
    </div>
  );
}

function Details({ r }: { r: Rehearsal }) {
  const ref = r.reference;
  return (
    <details className="group mt-6 rounded-lg bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[14px] font-medium text-ink-2 hover:text-ink">
        Price details
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-open:rotate-180" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <dl className="grid gap-x-6 gap-y-2 px-4 pb-4 text-[13px] sm:grid-cols-2">
        <Row k="Gap vs real price" v={r.premiumPct == null ? "–" : pct(r.premiumPct)} />
        <Row k="Price impact of your size" v={r.sizeImpactPct == null ? "–" : `${r.sizeImpactPct.toFixed(2)}%`} />
        <Row k="Cost to buy and sell straight back" v={r.roundTripCostPct == null ? "–" : `${r.roundTripCostPct.toFixed(2)}%`} />
        <Row k="Route" v={`${r.route.join(" → ")} via Jupiter`} />
        {ref?.account && <Row k="Price source" v={<a className="text-brand-ink hover:underline" href={`https://solscan.io/account/${ref.account}`} target="_blank" rel="noreferrer">{ref.source} · {shortAddr(ref.account)}</a>} />}
        {ref?.ageSec != null && <Row k="Price age" v={`${ref.ageSec}s`} />}
        {r.transferFeeBps > 0 && <Row k="Token transfer fee" v={`${(r.transferFeeBps / 100).toFixed(2)}% (included)`} />}
        {r.uiMultiplier !== 1 && <Row k="Split / dividend multiplier" v={`${r.uiMultiplier.toFixed(4)}× (applied)`} />}
      </dl>
    </details>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4 border-t border-line pt-2"><dt className="text-muted">{k}</dt><dd className="num text-right text-ink">{v}</dd></div>;
}

function Execute({ r, tone }: { r: Rehearsal; tone: Tone }) {
  const { publicKey, signTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [guardOn, setGuardOn] = useState(GUARD_LIVE);
  const [state, setState] = useState<{ s: "idle" | "building" | "signing" | "sending" | "done" | "error"; msg?: string; sig?: string }>({ s: "idle" });
  const [age, setAge] = useState(0);
  useEffect(() => { const t = setInterval(() => setAge(Math.round((Date.now() - r.at) / 1000)), 1000); return () => clearInterval(t); }, [r.at]);
  const stale = age > 30;
  const busy = ["building", "signing", "sending"].includes(state.s);
  const verb = r.side === "buy" ? "Buy" : "Sell";

  async function go() {
    if (!publicKey || !signTransaction) return;
    try {
      setState({ s: "building" });
      const body = JSON.stringify({ quote: r.quote, userPublicKey: publicKey.toBase58(), toleranceBps: r.asset.kind === "prestock" ? 500 : 100 });
      const b = await fetch(guardOn ? "/api/guarded-swap" : "/api/swap", { method: "POST", headers: { "content-type": "application/json" }, body }).then((x) => x.json());
      if (b.error) throw new Error(b.error);
      setState({ s: "signing" });
      const signed = await signTransaction(VersionedTransaction.deserialize(b64ToBytes(b.swapTransaction)));
      setState({ s: "sending" });
      const s = await fetch("/api/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signed: bytesToB64(signed.serialize()), lastValidBlockHeight: b.lastValidBlockHeight }) }).then((x) => x.json());
      if (s.error) {
        const blocked = /0x1770|"Custom":6000/.test(s.error);
        throw Object.assign(new Error(blocked ? "Stopped: the fill came in worse than fair, so nothing was traded." : s.error), { sig: s.signature });
      }
      setState({ s: "done", sig: s.signature });
    } catch (e) {
      setState({ s: "error", msg: e instanceof Error ? e.message : String(e), sig: (e as { sig?: string }).sig });
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <label className={cx("flex items-start gap-3 rounded-lg border border-line p-4", !GUARD_LIVE && "opacity-80")}>
        <input type="checkbox" checked={guardOn} disabled={!GUARD_LIVE} onChange={(e) => setGuardOn(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
        <span className="text-[14px]">
          <span className="font-semibold text-ink">Price protection</span>
          <span className="block text-muted">
            {GUARD_LIVE
              ? `Cancels the trade automatically if the fill comes in more than ${r.asset.kind === "prestock" ? "5%" : "1%"} worse than fair.`
              : <>Coming to mainnet soon. <a className="text-brand-ink hover:underline" href={`https://explorer.solana.com/address/${GUARD_ID}?cluster=devnet`} target="_blank" rel="noreferrer">Live on devnet</a>.</>}
          </span>
        </span>
      </label>

      {!connected ? (
        <Button size="lg" className="w-full" onClick={() => setVisible(true)}>Connect wallet to {verb.toLowerCase()}</Button>
      ) : stale ? (
        <Button size="lg" variant="secondary" className="w-full" disabled>Updating price…</Button>
      ) : (
        <Button size="lg" className="w-full" variant={tone === "bad" ? "danger" : "primary"} loading={busy} onClick={go}>
          {state.s === "building" ? "Preparing…" : state.s === "signing" ? "Approve in your wallet" : state.s === "sending" ? "Confirming…" : `${tone === "bad" ? `${verb} anyway` : verb} ${usd(r.usd)} of ${r.asset.symbol}`}
        </Button>
      )}

      {state.s === "done" && state.sig && (
        <p className="flex items-center justify-between rounded-lg bg-good-soft px-4 py-3 text-[14px] text-good">
          <span className="font-semibold">Order filled</span>
          <a className="font-medium underline" href={`https://solscan.io/tx/${state.sig}`} target="_blank" rel="noreferrer">View transaction</a>
        </p>
      )}
      {state.s === "error" && (
        <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-[14px] text-bad">
          {state.msg}{state.sig && <> <a className="underline" href={`https://solscan.io/tx/${state.sig}`} target="_blank" rel="noreferrer">View transaction</a></>}
        </p>
      )}
    </div>
  );
}
