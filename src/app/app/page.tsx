"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import type { Rehearsal } from "@/lib/rehearse";
import { useAssets, useBoard, type AssetOpt } from "@/lib/hooks";
import { gapTone, pct, price, shortAddr, usd, type Tone } from "@/lib/format";
import { Button, cx, InfoTip, Notice, Pill, Segmented, Skeleton, TokenIcon, toneText } from "@/components/ui";
import type { Passport as PassportData } from "@/lib/agent";
import Passport, { fairLabel, type Certificate } from "@/components/Passport";

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
  const [pp, setPp] = useState<PassportData | null>(null);
  const [ppLoading, setPpLoading] = useState(false);
  const [cert, setCert] = useState<Certificate | null>(null);
  const req = useRef(0);
  const ppReq = useRef(0);

  // A preset amount from ?usd= (e.g. "Back your call: own $10"), read once.
  useEffect(() => {
    const u = Number(params?.get("usd"));
    if (!(u >= 1 && u <= 50_000)) return;
    const t = setTimeout(() => setAmount(String(Math.round(u))), 0);
    return () => clearTimeout(t);
  }, [params]);

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
    let retry: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const run = async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/rehearse?mint=${mint}&usd=${usdAmount}&side=${side}`);
        const j = await r.json();
        if (id !== req.current) return;
        if (j.error) {
          // Busy upstream: keep what's on screen and try again shortly instead of showing an error.
          if (/rate limit|429|try again/i.test(j.error) && tries++ < 5) { retry = setTimeout(run, 2500 * tries); return; }
          setError(/no route|liquidity/i.test(j.error) ? "No one is selling this size right now. Try a smaller amount." : "Prices are unavailable right now. We'll keep trying.");
          setResult(null);
        } else { tries = 0; setResult(j); setError(null); }
      } catch {
        if (id === req.current) setError("You're offline. Check your connection.");
      } finally {
        if (id === req.current) setLoading(false);
      }
    };
    const t = setTimeout(run, 450);
    const every = setInterval(run, 20_000);
    return () => { clearTimeout(t); clearInterval(every); if (retry) clearTimeout(retry); };
  }, [mint, usdAmount, side]);

  // Token facts load alongside the quote; the verdict works without them.
  const symbol = asset?.symbol;
  useEffect(() => {
    if (!symbol || !(usdAmount > 0)) return;
    const id = ++ppReq.current;
    const run = async () => {
      setPpLoading(true);
      try {
        const j = await fetch(`/api/v1/passport?symbol=${symbol}&usd=${usdAmount}&side=${side}`).then((x) => x.json());
        if (id === ppReq.current && !j.error) setPp(j);
      } catch { /* optional */ } finally {
        if (id === ppReq.current) setPpLoading(false);
      }
    };
    const t = setTimeout(run, 600);
    const every = setInterval(run, 45_000);
    return () => { clearTimeout(t); clearInterval(every); };
  }, [symbol, usdAmount, side]);
  const ppNow = pp && pp.symbol === symbol && pp.side === side ? pp : null;
  const r = result && result.asset.symbol === symbol && result.side === side ? result : null;

  const pick = (m: string) => { setMint(m); setResult(null); setPp(null); setCert(null); };

  return (
    <div className="grid items-start gap-x-12 gap-y-8 [grid-template-areas:'hero''ticket''facts'] lg:grid-cols-[minmax(0,1fr)_360px] lg:[grid-template-areas:'hero_ticket''facts_ticket']">
      <div className="min-w-0 [grid-area:hero]">
        <Verdict r={r} asset={asset} loading={!r && !error} error={error && !r ? error : null} stale={loading && !!r} pp={ppNow} />
      </div>

      <aside className="[grid-area:ticket] lg:sticky lg:top-20">
        <Ticket assets={assets} board={board?.rows} mint={mint} onPick={pick} side={side} setSide={setSide} amount={amount} setAmount={setAmount} r={r} pp={ppNow} onCert={setCert} />
      </aside>

      <div className="min-w-0 [grid-area:facts]">
        <Passport p={ppNow} loading={ppLoading} cert={cert && cert.symbol === symbol ? cert : null} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- verdict

type Fair = { price: number; gapPct: number | null; overpayUsd: number | null; label: string; source: string };

// The price this trade is judged against: the token facts' evidence once loaded, else the quote's own reference.
function fairFor(r: Rehearsal, pp: PassportData | null): Fair | null {
  if (pp && pp.evidence.price != null && pp.fill.gapPct != null) {
    return { price: pp.evidence.price, gapPct: pp.fill.gapPct, overpayUsd: pp.fill.overpayUsd, label: fairLabel(pp.evidence.level), source: pp.evidence.source };
  }
  if (!r.reference || r.premiumPct == null) return null;
  return { price: r.reference.price, gapPct: r.premiumPct, overpayUsd: r.overpayUsd, label: r.asset.kind === "prestock" ? "Valuation" : "Real price", source: r.reference.source };
}

function headline(r: Rehearsal, f: Fair | null): { tone: Tone; label: string; title: string; sub?: string } {
  const p = f?.gapPct ?? null;
  const buy = r.side === "buy";
  const kind = r.asset.kind;
  if (p == null || f?.overpayUsd == null) return { tone: "neutral", label: "No reference", title: `${price(r.fillPrice)} per share`, sub: "No independent price right now." };
  const tone = gapTone(p, kind);
  const diff = Math.abs(f.overpayUsd);
  if (kind === "prestock") {
    const above = p >= 0;
    return {
      tone: above ? tone : p < -15 ? "warn" : "good",
      label: above ? (tone === "bad" ? "Well above valuation" : tone === "warn" ? "Above valuation" : "Near valuation") : "Below valuation",
      title: `${usd(diff)} ${above ? "above" : "below"} valuation`,
      sub: `${pct(p)} vs ${r.asset.name}'s last valuation.`,
    };
  }
  if (Math.abs(p) < 0.15 || diff < 0.5) return { tone: "good", label: "Fair price", title: "You're getting the real price", sub: `Within ${usd(Math.max(diff, 0.01))} of ${f.label === "24/7 price" ? "the 24/7 price" : "the live price"}.` };
  if (p < 0) return { tone: "good", label: "Better than fair", title: buy ? `${usd(diff)} under the real price` : `${usd(diff)} over the real price`, sub: `${pct(p)} vs ${f.label.toLowerCase()}.` };
  return {
    tone,
    label: tone === "bad" ? "Overpriced" : tone === "warn" ? "Pricey" : "Fair price",
    title: buy ? `You'd pay ${usd(diff)} more than it's worth` : `You'd get ${usd(diff)} less than it's worth`,
    sub: `${pct(p)} vs ${f.label.toLowerCase()}.`,
  };
}

function notes(r: Rehearsal, pp: PassportData | null): { tone: Tone; text: string; href?: string; link?: string }[] {
  const out: { tone: Tone; text: string; href?: string; link?: string }[] = [];
  if (pp && pp.kind === "xstock" && pp.market.regular === false) {
    out.push(pp.evidence.level === "perp"
      ? { tone: "neutral", text: "Market closed. Priced against the 24/7 price." }
      : { tone: "warn", text: "Market closed. The last price may be hours old." });
    if (pp.decision.action === "wait" && (pp.fill.gapPct ?? 0) > 0.5) out.push({ tone: "warn", text: `${pp.fill.gapPct!.toFixed(2)}% over the 24/7 price. Waiting for the open may fill better.` });
  } else if (!pp && r.reference?.market && !r.reference.market.open && r.asset.kind === "xstock") {
    out.push({ tone: "neutral", text: "Market closed. Prices can move at the open." });
  }
  if (pp?.market.nasdaqHalt || pp?.market.session?.issuerHalted) out.push({ tone: "bad", text: `${pp.name} is halted.` });
  if ((r.sizeImpactPct ?? 0) > 1) out.push({ tone: "warn", text: `Your size moves the price ${r.sizeImpactPct!.toFixed(1)}%.` });
  if ((r.roundTripCostPct ?? 0) > 2) out.push({ tone: "warn", text: `Selling straight back costs ${r.roundTripCostPct!.toFixed(1)}%.` });
  return out;
}

function Verdict({ r, asset, loading, error, stale, pp }: { r: Rehearsal | null; asset?: AssetOpt; loading: boolean; error: string | null; stale: boolean; pp: PassportData | null }) {
  const head = (
    <div className="flex items-center gap-3">
      {asset ? <TokenIcon src={asset.icon} symbol={asset.symbol} size={40} /> : <Skeleton className="h-10 w-10 rounded-full" />}
      <div className="min-w-0">
        <p className="truncate text-[17px] font-semibold leading-tight">{asset?.name ?? " "}</p>
        <p className="text-[13px] text-muted">{asset ? `${asset.symbol} · ${asset.kind === "xstock" ? "US stock" : "Pre-IPO"}` : " "}</p>
      </div>
    </div>
  );
  if (error) return <section className="space-y-6">{head}<Notice tone="bad">{error}</Notice></section>;
  if (loading || !r) {
    return (
      <section aria-busy="true" className="space-y-6">
        {head}
        <div><Skeleton className="h-6 w-24" /><Skeleton className="mt-4 h-10 w-3/4" /><Skeleton className="mt-3 h-5 w-1/3" /></div>
        <Skeleton className="h-14 w-full" />
        <div className="grid grid-cols-3 gap-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      </section>
    );
  }
  const f = fairFor(r, pp);
  const h = headline(r, f);
  const ns = notes(r, pp);
  return (
    <section aria-live="polite" className={cx("space-y-7 transition-opacity duration-200", stale && "opacity-70")}>
      {head}
      <div>
        <Pill tone={h.tone}>{h.label}</Pill>
        <h1 key={h.title} className="settle mt-3 text-[30px] font-semibold leading-[1.15] sm:text-[36px]">{h.title}</h1>
        {h.sub && <p className="mt-2 text-[15px] text-muted">{h.sub}</p>}
      </div>

      {f && <PriceScale fill={r.fillPrice} fair={f.price} tone={h.tone} fairLabel={f.label} side={r.side} />}

      <dl className="grid grid-cols-3 gap-6 border-t border-line pt-5">
        <Stat label={r.side === "buy" ? "You pay" : "You get"} value={price(r.fillPrice)} sub="per share" />
        <Stat label={f?.label ?? "Real price"} value={f ? price(f.price) : "–"} sub="per share" />
        <Stat label="You receive" value={r.tokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} sub={r.asset.symbol} />
      </dl>

      {ns.length > 0 && (
        <div className="space-y-2">
          {ns.map((n) => (
            <Notice key={n.text} tone={n.tone} action={n.href ? <Link href={n.href} className="shrink-0 font-medium text-brand-ink hover:underline">{n.link}</Link> : undefined}>{n.text}</Notice>
          ))}
        </div>
      )}

      <Details r={r} />
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="num mt-1 truncate text-[18px] font-semibold">{value}</dd>
      {sub && <dd className="truncate text-[12px] text-muted">{sub}</dd>}
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
    <figure className="px-1" aria-label={`Your price ${price(fill)} against ${fairLabel.toLowerCase()} ${price(fair)}`}>
      <div className="relative h-14">
        <div className="absolute inset-x-0 top-6 h-1 rounded-full bg-surface-2" />
        <div className="absolute top-6 h-1 rounded-full transition-[left,width] duration-300 ease-out" style={{ left: `${a}%`, width: `${Math.max(b - a, 0.6)}%`, background: color, opacity: 0.45 }} />
        <Marker x={x(fair)} label={fairLabel} value={price(fair)} className="bg-ink" top />
        <Marker x={x(fill)} label={side === "buy" ? "You pay" : "You get"} value={price(fill)} style={{ background: color }} />
      </div>
    </figure>
  );
}
function Marker({ x, label, value, className, style, top }: { x: number; label: string; value: string; className?: string; style?: React.CSSProperties; top?: boolean }) {
  const align = x < 20 ? "left-0" : x > 80 ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <div className="absolute top-0 h-full transition-[left] duration-300 ease-out" style={{ left: `${x}%` }}>
      <span className={cx("absolute top-[18px] h-3.5 w-3.5 -translate-x-1/2 rounded-full ring-4 ring-bg", className)} style={style} />
      <span className={cx("num absolute whitespace-nowrap text-[12px] text-muted", align, top ? "-top-1" : "top-10")}>
        {label} <b className="font-semibold text-ink">{value}</b>
      </span>
    </div>
  );
}

function Details({ r }: { r: Rehearsal }) {
  const ref = r.reference;
  return (
    <details className="group border-t border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-[13.5px] font-medium text-muted hover:text-ink">
        Details
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-open:rotate-180" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <dl className="grid gap-x-8 gap-y-2 pb-4 text-[13px] sm:grid-cols-2">
        <Row k="Gap to real price" v={r.premiumPct == null ? "–" : pct(r.premiumPct)} />
        <Row k="Your size's price impact" v={r.sizeImpactPct == null ? "–" : `${r.sizeImpactPct.toFixed(2)}%`} />
        <Row k="Round-trip cost" v={r.roundTripCostPct == null ? "–" : `${r.roundTripCostPct.toFixed(2)}%`} />
        <Row k="Route" v={`${r.route.join(" → ")}`} />
        {ref?.account && <Row k="Price feed" v={<a className="text-brand-ink hover:underline" href={`https://solscan.io/account/${ref.account}`} target="_blank" rel="noreferrer">{shortAddr(ref.account)}</a>} />}
        {ref?.ageSec != null && <Row k="Price age" v={`${ref.ageSec}s`} />}
        {r.transferFeeBps > 0 && <Row k="Transfer fee" v={`${(r.transferFeeBps / 100).toFixed(2)}%, included`} />}
        {r.uiMultiplier !== 1 && <Row k="Share multiplier" v={`${r.uiMultiplier.toFixed(4)}×, applied`} />}
      </dl>
    </details>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4 border-t border-line pt-2"><dt className="text-muted">{k}</dt><dd className="num truncate text-right text-ink">{v}</dd></div>;
}

// ---------------------------------------------------------------- ticket

function Ticket({ assets, board, mint, onPick, side, setSide, amount, setAmount, r, pp, onCert }: {
  assets: AssetOpt[] | null; board?: { mint: string; premiumPct: number | null; kind: string }[]; mint: string; onPick: (m: string) => void;
  side: "buy" | "sell"; setSide: (s: "buy" | "sell") => void; amount: string; setAmount: (a: string) => void;
  r: Rehearsal | null; pp: PassportData | null; onCert: (c: Certificate) => void;
}) {
  const { publicKey, signTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const available = !!pp?.protect.available;
  const [guardOn, setGuardOn] = useState(true);
  const protect = guardOn && available;
  const [state, setState] = useState<{ s: "idle" | "building" | "signing" | "sending" | "done" | "error"; msg?: string; sig?: string }>({ s: "idle" });
  const [age, setAge] = useState(0);
  useEffect(() => { if (!r) return; const t = setInterval(() => setAge(Math.round((Date.now() - r.at) / 1000)), 1000); return () => clearInterval(t); }, [r]);
  const stale = age > 30;
  const busy = ["building", "signing", "sending"].includes(state.s);
  const verb = side === "buy" ? "Buy" : "Sell";
  const [limitPick, setLimitPick] = useState<number | null>(null);
  const bps = limitPick ?? pp?.protect.maxGapBps ?? null;
  const choices = pp ? [...new Set((pp.kind === "prestock" ? [100, 500, pp.protect.maxGapBps] : [25, 50, 100, 300, pp.protect.maxGapBps]))].sort((a, b) => a - b).slice(0, 4) : [];
  const fair = pp?.evidence.price ?? r?.reference?.price ?? null;
  const worst = fair != null && bps != null ? fair * (1 + (side === "buy" ? 1 : -1) * bps / 10_000) : null;
  const tone: Tone = r ? gapTone(pp?.fill.gapPct ?? r.premiumPct, r.asset.kind) : "neutral";

  async function go() {
    if (!publicKey || !signTransaction || !r) return;
    try {
      setState({ s: "building" });
      const b = protect
        ? await fetch("/api/v1/swap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol: r.asset.symbol, usd: r.usd, side: r.side, wallet: publicKey.toBase58(), maxGapBps: bps ?? undefined }) }).then((x) => x.json())
        : await fetch("/api/swap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quote: r.quote, userPublicKey: publicKey.toBase58() }) }).then((x) => x.json()).then((j) => ({ ...j, transaction: j.swapTransaction }));
      if (b.error) throw new Error(b.error);
      setState({ s: "signing" });
      const signed = await signTransaction(VersionedTransaction.deserialize(b64ToBytes(b.transaction)));
      setState({ s: "sending" });
      const s = await fetch("/api/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signed: bytesToB64(signed.serialize()), lastValidBlockHeight: b.lastValidBlockHeight }) }).then((x) => x.json());
      if (s.error) {
        const blocked = /"Custom":6001|0x1771/.test(s.error);
        throw Object.assign(new Error(blocked ? "Cancelled: the fill was worse than your limit. Nothing was traded." : s.error), { sig: s.signature });
      }
      setState({ s: "done", sig: s.signature });
      if (protect) {
        for (let i = 0; i < 6; i++) {
          const c = await fetch(`/api/v1/certificate?sig=${s.signature}`).then((x) => x.json()).catch(() => null);
          if (c && !c.error) { onCert(c); break; }
          await new Promise((res) => setTimeout(res, 1500));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ s: "error", msg: /User rejected|rejected the request/i.test(msg) ? "You cancelled in your wallet. Nothing was sent." : msg, sig: (e as { sig?: string }).sig });
    }
  }

  return (
    <section aria-label="Order" className="rounded-xl border border-line bg-panel p-5">
      <TokenPicker assets={assets} value={mint} onChange={onPick} board={board} />
      <div className="mt-4"><Segmented label="Side" value={side} onChange={setSide} options={[{ value: "buy", label: "Buy" }, { value: "sell", label: "Sell" }]} /></div>

      <label htmlFor="amount" className="mt-5 block text-[12.5px] text-muted">{side === "buy" ? "Amount" : "Amount to sell"}</label>
      <div className="mt-1.5 flex items-center rounded-lg border border-line bg-bg px-3.5 transition-colors focus-within:border-ink">
        <span className="text-[22px] font-medium text-muted">$</span>
        <input id="amount" inputMode="decimal" autoComplete="off" value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 9))}
          className="num w-full bg-transparent px-1 py-2.5 text-[22px] font-semibold outline-none" />
        <span className="text-[12.5px] text-muted">USDC</span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {[100, 500, 1000, 5000].map((v) => (
          <button key={v} onClick={() => setAmount(String(v))}
            className={cx("num h-8 rounded-md border text-[12.5px] font-medium transition-colors",
              Number(amount) === v ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-line-strong hover:text-ink")}>
            ${v >= 1000 ? `${v / 1000}k` : v}
          </button>
        ))}
      </div>

      <dl className="mt-5 space-y-2 border-t border-line pt-4 text-[13.5px]">
        <Line k={side === "buy" ? "Price per share" : "You get per share"} v={r ? price(r.fillPrice) : null} />
        <Line k="Fair price" v={fair != null ? price(fair) : r ? "–" : null} />
        <Line k="You receive" v={r ? `${r.tokens.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${r.asset.symbol}` : null} />
      </dl>

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1 text-[13.5px] font-medium">
            Price protection
            <InfoTip label="About price protection">The trade cancels on-chain if the fill is worse than fair value by more than your limit. You keep a receipt either way.</InfoTip>
          </span>
          <Switch checked={protect} disabled={!available} onChange={setGuardOn} label="Price protection" />
        </div>
        {!pp ? <Skeleton className="mt-3 h-8 w-full" />
          : !available ? <p className="mt-2 text-[12.5px] text-muted">Unavailable right now.</p>
          : protect && (
            <>
              <div className="mt-3"><Segmented size="sm" label="Protection limit" value={String(bps)} onChange={(v) => setLimitPick(Number(v))}
                options={choices.map((c) => ({ value: String(c), label: `${(c / 100).toFixed(c % 100 ? 2 : 0)}%` }))} /></div>
              {worst != null && <p className="num mt-2 text-[12.5px] text-muted">Cancels if {side === "buy" ? "above" : "below"} {price(worst)}</p>}
            </>
          )}
      </div>

      <div className="mt-5">
        {!connected ? (
          <Button size="lg" className="w-full" onClick={() => setVisible(true)}>Connect wallet</Button>
        ) : !r || stale ? (
          <Button size="lg" variant="secondary" className="w-full" disabled>{r ? "Updating price…" : "Getting price…"}</Button>
        ) : (
          <Button size="lg" className="w-full" variant={tone === "bad" ? "danger" : "primary"} loading={busy} onClick={go}>
            {state.s === "building" ? "Preparing…" : state.s === "signing" ? "Approve in wallet" : state.s === "sending" ? "Confirming…" : `${tone === "bad" ? `${verb} anyway` : verb} ${usd(r.usd)}`}
          </Button>
        )}
      </div>

      {state.s === "done" && state.sig && (
        <Notice tone="good" className="mt-3" action={<a className="shrink-0 font-medium underline" href={`https://solscan.io/tx/${state.sig}`} target="_blank" rel="noreferrer">View</a>}>
          {protect ? "Filled within your limit." : "Order filled."}
        </Notice>
      )}
      {state.s === "error" && state.msg && (
        <Notice tone="bad" className="mt-3" action={state.sig ? <a className="shrink-0 font-medium underline" href={`https://solscan.io/tx/${state.sig}`} target="_blank" rel="noreferrer">View</a> : undefined}>
          {state.msg}
        </Notice>
      )}
    </section>
  );
}

function Line({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="num text-ink">{v ?? <Skeleton className="h-4 w-20" />}</dd>
    </div>
  );
}

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cx("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-50", checked ? "bg-brand" : "bg-line-strong")}>
      <span className={cx("absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
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
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox" aria-label="Choose a stock"
        className="flex w-full items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-line-strong">
        {selected ? <TokenIcon src={selected.icon} symbol={selected.symbol} size={24} /> : <Skeleton className="h-6 w-6 rounded-full" />}
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{selected?.name ?? "Loading…"}</span>
        <span className="text-[12.5px] text-muted">{selected?.symbol}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-[var(--z-dropdown)] mt-1.5 overflow-hidden rounded-lg border border-line bg-panel shadow-card">
          <div className="border-b border-line p-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
              className="w-full rounded-md bg-surface-2 px-3 py-2 text-[14px] outline-none placeholder:text-muted" />
          </div>
          <div role="listbox" className="max-h-80 overflow-y-auto p-1">
            {groups.map((g) => g.items.length > 0 && (
              <div key={g.title}>
                <div className="px-2.5 pb-1 pt-2.5 text-[12px] font-medium text-muted">{g.title}</div>
                {g.items.map((a) => {
                  const row = board?.find((b) => b.mint === a.mint);
                  return (
                    <button key={a.mint} role="option" aria-selected={a.mint === value}
                      onClick={() => { onChange(a.mint); setOpen(false); setQ(""); }}
                      className={cx("flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-2", a.mint === value && "bg-surface-2")}>
                      <TokenIcon src={a.icon} symbol={a.symbol} size={24} />
                      <span className="min-w-0 flex-1 truncate text-[14px]">{a.name}</span>
                      <span className="text-[12px] text-muted">{a.symbol}</span>
                      {row?.premiumPct != null && <span className={cx("num w-14 text-right text-[12px] font-medium", toneText[gapTone(row.premiumPct, a.kind)])}>{pct(row.premiumPct, 1)}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            {list.length === 0 && <p className="px-3 py-6 text-center text-[14px] text-muted">No match for “{q}”.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
