"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Pill, TokenIcon, cx } from "@/components/ui";
import { fmtDay, fmtPct, load, save, score, shareQuery, type Dir, type PracticeCard, type Score } from "@/lib/call";
import { price } from "@/lib/format";
import { ShareRow } from "./Share";

const ROUND = 10;
type Played = { card: PracticeCard; dir: Dir; s: Score };

function shuffle<T>(a: T[]) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// One short, true sentence after each reveal: what this weekend teaches.
function lesson(c: PracticeCard, s: Score, hitRate: number | null) {
  const tok = fmtPct(c.tokenMove * 100);
  if (s.flat) return `A flat open. The weekend brought no real news for ${c.ticker}.`;
  if (s.modelRight === false) return `The token overshot. Weekend pools are thin, so a few big trades can move them, which is why every forecast comes with a range.`;
  if (Math.abs(c.actualMove) >= 0.01) return `Big weekend news shows up in the token first. ${c.ticker}'s token moved ${tok} on Solana before Wall Street reopened.`;
  if (hitRate != null) return `Even small weekend moves count: ${c.ticker}'s token pointed the right way on ${hitRate}% of weekends in this sample.`;
  return `The token traded all weekend on Solana while the real stock couldn't, so it had already moved when Monday came.`;
}

export default function Practice({ deck, onLive }: { deck: PracticeCard[]; onLive: () => void }) {
  const [cards, setCards] = useState<PracticeCard[]>([]);
  const [i, setI] = useState(0);
  const [played, setPlayed] = useState<Played[]>([]);
  const [showSignal, setShowSignal] = useState(true);
  const [best, setBest] = useState(0);
  const [done, setDone] = useState(false);
  const cur = cards[i];
  const last = played.length === i + 1 ? played[i] : null;

  // Direction hit rate per ticker over the whole sample, for the lessons.
  const hit = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of new Set(deck.map((d) => d.ticker))) {
      const moved = deck.filter((d) => d.ticker === t && Math.abs(d.actualMove) > 0.001);
      if (moved.length >= 8) m.set(t, Math.round((moved.filter((d) => Math.sign(d.tokenMove) === Math.sign(d.actualMove)).length / moved.length) * 100));
    }
    return m;
  }, [deck]);

  const start = useCallback(() => {
    setCards(shuffle(deck).slice(0, ROUND));
    setI(0);
    setPlayed([]);
    setDone(false);
  }, [deck]);

  useEffect(() => {
    const t = setTimeout(() => { start(); setBest(load().practiceBest); }, 0);
    return () => clearTimeout(t);
  }, [start]);

  const call = useCallback((dir: Dir) => {
    if (!cur || last) return;
    try { navigator.vibrate?.(12); } catch { /* not supported */ }
    const s = score(dir, null, cur.actualMove * 100, cur.tokenMove * 100);
    setPlayed((p) => [...p, { card: cur, dir, s }]);
  }, [cur, last]);

  const next = useCallback(() => {
    if (!last) return;
    if (i < cards.length - 1) setI(i + 1); else setDone(true);
  }, [last, i, cards.length]);

  const total = played.reduce((a, p) => a + p.s.total, 0);
  const youRight = played.filter((p) => p.s.right).length;
  const modelRight = played.filter((p) => p.s.modelRight).length;

  useEffect(() => {
    if (done && total > best) { save({ practiceBest: total }); const t = setTimeout(() => setBest(total), 0); return () => clearTimeout(t); }
  }, [done, total, best]);

  // Keyboard: arrows or U/D to call, Enter or Space for the next card.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "ArrowUp" || e.key === "u") { e.preventDefault(); call(1); }
      else if (e.key === "ArrowDown" || e.key === "d") { e.preventDefault(); call(-1); }
      else if ((e.key === "Enter" || e.key === " " || e.key === "ArrowRight") && last && !done) { e.preventDefault(); next(); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [call, next, last, done]);

  if (!cur) return <div className="h-[420px]" />;

  if (done) {
    const q = shareQuery({ you: [youRight, cards.length], model: [modelRight, cards.length], pts: total });
    const beat = youRight > modelRight ? "You beat Rehearsal." : youRight === modelRight ? "You tied Rehearsal." : "Rehearsal won this one.";
    return (
      <div className="card-in mx-auto max-w-xl rounded-2xl border border-line bg-panel p-6 sm:p-8">
        <p className="text-[13px] font-medium text-muted">Practice round</p>
        <h2 className="mt-1 text-[28px] font-semibold leading-tight">{beat}</h2>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Big label="You" value={`${youRight}/${cards.length}`} />
          <Big label="Rehearsal" value={`${modelRight}/${cards.length}`} />
          <Big label="Points" value={String(total)} sub={total >= best && total > 0 ? "Your best" : `Best ${best}`} />
        </div>
        <ol className="mt-6 divide-y divide-line border-y border-line text-[13.5px]">
          {played.map((p, k) => (
            <li key={k} className="flex items-center gap-3 py-2">
              <TokenIcon src={p.card.icon} symbol={p.card.ticker} size={20} />
              <span className="w-14 font-medium">{p.card.ticker}</span>
              <span className="num whitespace-nowrap text-muted">{fmtDay(p.card.mon).replace(/, \d{4}$/, "")}</span>
              <span className="num ml-auto">{fmtPct(p.card.actualMove * 100)}</span>
              <Pill tone={p.s.right ? "good" : "bad"} className="w-16 justify-center">{p.s.right ? `+${p.s.total}` : "Miss"}</Pill>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button size="lg" onClick={onLive}>Call this weekend for real</Button>
          <Button size="lg" variant="secondary" onClick={start}>Play again</Button>
        </div>
        <ShareRow className="mt-4" query={q} text={`I called ${youRight}/${cards.length} real Monday opens from weekend Solana prices. ${beat} Your turn:`} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-3 flex items-center justify-between text-[13px] text-muted">
        <span className="num">Card {i + 1} of {cards.length}</span>
        <span className="num">You {youRight} · Rehearsal {modelRight} · <span className="font-medium text-ink">{total} pts</span></span>
      </div>
      <div className="mb-4 flex gap-1" aria-hidden="true">
        {cards.map((_, k) => <span key={k} className={cx("h-1 flex-1 rounded-full transition-colors", k < played.length ? (played[k].s.right ? "bg-good" : "bg-bad") : k === i ? "bg-ink" : "bg-surface-2")} />)}
      </div>

      <SwipeCard key={`${cur.symbol}-${cur.mon}`} onCall={call} locked={!!last}>
        <div className="flex items-center gap-3">
          <TokenIcon src={cur.icon} symbol={cur.ticker} size={40} />
          <div className="min-w-0">
            <p className="text-[17px] font-semibold leading-tight">{cur.name}</p>
            <p className="text-[13px] text-muted">Weekend of {fmtDay(cur.fri)}</p>
          </div>
        </div>

        <p className="mt-6 text-[14px] text-muted">Friday&apos;s close</p>
        <p className="num text-[34px] font-semibold leading-none tracking-[-0.02em]">{price(cur.closeFri)}</p>

        {showSignal ? (
          <p className="mt-5 rounded-lg bg-surface px-3.5 py-3 text-[14px] leading-snug">
            While Wall Street was closed, its token on Solana moved{" "}
            <span className={cx("num font-semibold", cur.tokenMove >= 0 ? "text-good" : "text-bad")}>{fmtPct(cur.tokenMove * 100)}</span>.
          </p>
        ) : (
          <p className="mt-5 rounded-lg bg-surface px-3.5 py-3 text-[14px] text-muted">Hard mode: no weekend signal.</p>
        )}

        <div aria-live="polite">
          {last ? (
            <div className="pop mt-5">
              <p className="text-[14px] text-muted">Monday&apos;s open</p>
              <p className="num flex flex-wrap items-baseline gap-x-3 text-[34px] font-semibold leading-none tracking-[-0.02em]">
                {price(cur.openMon)}
                <span className={cx("text-[20px]", cur.actualMove >= 0 ? "text-good" : "text-bad")}>{fmtPct(cur.actualMove * 100)}</span>
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Pill tone={last.s.right ? "good" : "bad"}>You: {last.dir > 0 ? "Up" : "Down"} · {last.s.right ? `+${last.s.total} pts` : "miss"}</Pill>
                <Pill tone={last.s.modelRight ? "good" : "bad"}>Rehearsal: {cur.tokenMove >= 0 ? "Up" : "Down"}</Pill>
              </div>
              <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{lesson(cur, last.s, hit.get(cur.ticker) ?? null)}</p>
            </div>
          ) : (
            <p className="mt-5 text-[15px] font-medium">Where did it open on Monday?</p>
          )}
        </div>
      </SwipeCard>

      <div className="mt-4">
        {last ? (
          <Button size="lg" className="w-full" onClick={next} autoFocus>{i < cards.length - 1 ? "Next weekend" : "See your score"}</Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <CallButton dir={1} onClick={() => call(1)} />
            <CallButton dir={-1} onClick={() => call(-1)} />
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={!showSignal} onChange={(e) => setShowSignal(!e.target.checked)} className="accent-[var(--brand)]" /> Hard mode
        </label>
        <span className="hidden sm:inline">Swipe, or use ↑ ↓ then Enter</span>
        <span className="sm:hidden">Swipe the card up or down</span>
        {best > 0 && <span className="num">Best {best} pts</span>}
      </div>
      <p className="mt-6 text-[12.5px] text-muted">
        Real weekends from the last six months: Friday&apos;s 4 PM close, the token&apos;s move on its main Solana pool until 9 AM Monday, and the real open. <Link href="/app/weekend" className="underline underline-offset-2 hover:text-ink">Method</Link>
      </p>
    </div>
  );
}

function Big({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-3">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className="num text-[26px] font-semibold leading-tight">{value}</p>
      {sub && <p className="text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

export function CallButton({ dir, onClick, selected, size = "lg" }: { dir: Dir; onClick: () => void; selected?: boolean; size?: "md" | "lg" }) {
  const up = dir > 0;
  return (
    <button onClick={onClick} aria-pressed={selected}
      className={cx("flex items-center justify-center gap-2 rounded-xl border font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]",
        size === "lg" ? "h-14 text-[16px]" : "h-10 text-[14px]",
        selected ? (up ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad") : "border-line bg-panel text-ink hover:border-line-strong hover:bg-surface")}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {up ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M19 12l-7 7-7-7" />}
      </svg>
      {up ? "Up" : "Down"}
    </button>
  );
}

// The card follows a vertical drag; past the threshold it makes the call.
function SwipeCard({ children, onCall, locked }: { children: React.ReactNode; onCall: (d: Dir) => void; locked: boolean }) {
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  const T = 70;
  const end = () => {
    if (start.current == null) return;
    start.current = null;
    if (dy <= -T) onCall(1); else if (dy >= T) onCall(-1);
    setDy(0);
  };
  const hint = locked ? null : dy <= -24 ? "up" : dy >= 24 ? "down" : null;
  return (
    <div className="card-in">
    <div
      onPointerDown={(e) => { if (locked || e.pointerType === "mouse") return; start.current = e.clientY; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (start.current != null) setDy(Math.max(-140, Math.min(140, e.clientY - start.current))); }}
      onPointerUp={end} onPointerCancel={end}
      style={{ transform: dy ? `translateY(${dy * 0.6}px) rotate(${dy * 0.02}deg)` : undefined, touchAction: locked ? "auto" : "pan-x" }}
      className={cx("relative select-none rounded-2xl border bg-panel p-5 shadow-card transition-[border-color] sm:p-6",
        !dy && "transition-transform duration-200 ease-out",
        hint === "up" ? "border-good" : hint === "down" ? "border-bad" : "border-line")}>
      {hint && (
        <span className={cx("absolute right-4 top-4 rounded-md px-2 py-1 text-[12px] font-semibold", hint === "up" ? "bg-good-soft text-good" : "bg-bad-soft text-bad")}>
          {hint === "up" ? "Up" : "Down"}
        </span>
      )}
      {children}
    </div>
    </div>
  );
}
