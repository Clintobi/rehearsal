"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, Notice, Pill, Skeleton, TokenIcon, cx } from "@/components/ui";
import { useFetch } from "@/lib/hooks";
import { price } from "@/lib/format";
import { fmtDay, fmtPct, load, roundState, save, score, shareQuery, until, type Dir, type LiveCall } from "@/lib/call";
import type { Forecast } from "@/lib/weekend";
import { CallButton } from "./Practice";
import { ShareRow } from "./Share";

type Weekend = { open: boolean; forecasts: Forecast[]; error?: string };
type Opens = { round: string; opens: Record<string, { close: number; open: number | null; openDate: string | null }> };

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

const nyTime = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

export default function LiveRound({ onPractice }: { onPractice: () => void }) {
  const { data, error } = useFetch<Weekend>("/api/weekend", 60_000, 60_000);
  const now = useNow();
  const rs = roundState(now);
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [streak, setStreak] = useState(0);
  useEffect(() => { const t = setTimeout(() => { const s = load(); setCalls(s.calls); setStreak(s.streak); }, 0); return () => clearTimeout(t); }, []);

  const forecasts = useMemo(() => (data?.forecasts ?? []).filter((f) => f.close), [data]);
  const round = forecasts.find((f) => f.closeDate)?.closeDate ?? null;
  const open = rs.phase === "open" && data && !data.open && !!round;
  const mine = (sym: string) => calls.find((c) => c.round === round && c.symbol === sym);
  // Most recent earlier round with calls in it: that's the one to score.
  const past = [...new Set(calls.map((c) => c.round))].filter((r) => r !== round || !open).sort().pop() ?? null;

  const put = (f: Forecast, patch: Partial<LiveCall> & { dir?: Dir }) => {
    if (!round) return;
    try { navigator.vibrate?.(12); } catch { /* not supported */ }
    const prev = mine(f.symbol);
    const next: LiveCall = { round, symbol: f.symbol, ticker: f.ticker, dir: prev?.dir ?? 1, pct: prev?.pct ?? null, modelPct: f.changePct, at: now.getTime(), ...patch };
    // An exact move must agree with the direction.
    if (next.pct != null && Math.sign(next.pct) !== next.dir) next.pct = -next.pct;
    const all = [...calls.filter((c) => !(c.round === round && c.symbol === f.symbol)), next].slice(-200);
    setCalls(all);
    save({ calls: all });
  };

  const inRound = round ? calls.filter((c) => c.round === round) : [];

  return (
    <div className="space-y-8">
      {(error || data?.error) && (
        <Notice tone="warn" action={<Button size="sm" variant="secondary" onClick={onPractice}>Practice</Button>}>
          Live prices are unavailable right now, so this round can&apos;t take calls. Practice still works.
        </Notice>
      )}

      {!data && !error && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>}

      {data && open && rs.phase === "open" && (
        <section aria-labelledby="round-h" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="round-h" className="text-[20px] font-semibold">{rs.weekend ? "Where does each stock open on Monday?" : "Where does each stock open tomorrow?"}</h2>
              <p className="num mt-1 text-[14px] text-muted">Calls lock at 9:00 AM New York, in {until(rs.locksAt, now)}. Make your call, then see Rehearsal&apos;s.</p>
            </div>
            {streak > 1 && <Pill tone="good">{streak} right in a row</Pill>}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {forecasts.map((f) => {
              const c = mine(f.symbol);
              return (
                <li key={f.symbol} className={cx("card-in rounded-2xl border bg-panel p-4 transition-colors", c ? "border-line-strong" : "border-line")}>
                  <div className="flex items-center gap-3">
                    <TokenIcon src={f.icon} symbol={f.ticker} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{f.name.replace(/ xStock$/, "")}</p>
                      <p className="num text-[12.5px] text-muted">{f.ticker} · closed {price(f.close!)}{f.closeDate ? ` on ${fmtDay(f.closeDate).replace(/, \d{4}$/, "")}` : ""}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <CallButton size="md" dir={1} selected={c?.dir === 1} onClick={() => put(f, { dir: 1 })} />
                    <CallButton size="md" dir={-1} selected={c?.dir === -1} onClick={() => put(f, { dir: -1 })} />
                  </div>
                  {c && (
                    <div className="pop mt-3 space-y-3">
                      <label className="flex items-center gap-2 text-[13px] text-muted">
                        Exact move, for bonus points
                        <span className="relative ml-auto">
                          <input type="number" inputMode="decimal" step="0.1" min="0" max="20" placeholder="—"
                            defaultValue={c.pct != null ? Math.abs(c.pct) : ""}
                            onBlur={(e) => { const v = parseFloat(e.target.value); put(f, { pct: Number.isFinite(v) && v > 0 ? Math.min(20, v) * c.dir : null }); }}
                            className="num h-9 w-20 rounded-lg border border-line bg-bg pl-2.5 pr-6 text-right text-[14px] text-ink" aria-label={`Exact move for ${f.ticker}, percent`} />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px]">%</span>
                        </span>
                      </label>
                      <div className="rounded-lg bg-surface px-3 py-2.5 text-[13.5px]">
                        {f.changePct != null ? (
                          <>Rehearsal says <span className={cx("num font-semibold", f.changePct >= 0 ? "text-good" : "text-bad")}>{fmtPct(f.changePct)}</span>
                            {f.record.movedWeekends > 0 && <span className="text-muted"> · right on {f.record.rightDirection} of {f.record.movedWeekends} weekends</span>}</>
                        ) : <span className="text-muted">Rehearsal&apos;s forecast shows once weekend token prices load.</span>}
                      </div>
                      <Link href={`/app?t=${f.symbol}&usd=10`} className="flex items-center justify-between rounded-lg px-1 text-[13.5px] font-medium text-brand-ink hover:underline">
                        Back your call: own $10 of {f.ticker}
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="sticky bottom-20 z-[var(--z-dropdown)] rounded-2xl border border-line bg-panel/95 p-4 shadow-card backdrop-blur md:bottom-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[14px]"><span className="num font-semibold">{inRound.length} of {forecasts.length}</span> called · saved on this device</p>
              {inRound.length > 0 && (
                <ShareRow query={shareQuery({ round: round!, calls: inRound.map((c) => ({ ticker: c.ticker, dir: c.dir, pct: c.pct })) })}
                  text={`My Monday Call: ${inRound.slice(0, 4).map((c) => `${c.ticker} ${c.dir > 0 ? "up" : "down"}${c.pct != null ? ` ${fmtPct(c.pct, 1)}` : ""}`).join(", ")}. Beat me:`} />
              )}
            </div>
          </div>
        </section>
      )}

      {data && !data.error && !open && (
        <section className="rounded-2xl border border-line bg-panel p-6">
          <h2 className="text-[20px] font-semibold">Calls are closed while the market trades</h2>
          <p className="num mt-1 text-[14px] text-muted">
            {rs.phase === "locked" ? <>The next round opens at 4:00 PM New York, in {until(rs.opensAt, now)}.</> : "The next round opens after the close."}
          </p>
          <Button className="mt-4" onClick={onPractice}>Practice on past weekends</Button>
        </section>
      )}

      {past && <Results round={past} calls={calls.filter((c) => c.round === past)} icons={Object.fromEntries((data?.forecasts ?? []).map((f) => [f.ticker, f.icon]))}
        onStreak={(s) => { setStreak(s); }} now={now} />}
    </div>
  );
}

function Results({ round, calls, icons, onStreak, now }: { round: string; calls: LiveCall[]; icons: Record<string, string>; onStreak: (s: number) => void; now: Date }) {
  const tickers = calls.map((c) => c.ticker).sort().join(",");
  const { data } = useFetch<Opens>(`/api/call/opens?round=${round}&tickers=${tickers}`, 60_000, 120_000);
  const rows = calls.map((c) => {
    const o = data?.opens?.[c.ticker];
    const actual = o?.open != null ? (o.open / o.close - 1) * 100 : null;
    return { c, o, actual, s: actual != null ? score(c.dir, c.pct, actual, c.modelPct) : null };
  });
  const scored = rows.filter((r) => r.s);
  const pts = scored.reduce((a, r) => a + r.s!.total, 0);
  const you = scored.filter((r) => r.s!.right).length;
  const model = scored.filter((r) => r.s!.modelRight).length;
  const complete = scored.length === rows.length && rows.length > 0;

  // Streak: count each round once, the first time it is fully scored.
  useEffect(() => {
    if (!complete) return;
    const saved = load();
    if (saved.scored.includes(round)) return;
    let s = saved.streak;
    for (const r of scored) s = r.s!.right ? s + 1 : 0;
    save({ streak: s, scored: [...saved.scored, round].slice(-50) });
    onStreak(s);
  }, [complete, round, scored, onStreak]);

  return (
    <section aria-labelledby="res-h" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="res-h" className="text-[20px] font-semibold">Your calls from {fmtDay(round).replace(/, \d{4}$/, "")}</h2>
        {complete && <p className="num text-[14px] text-muted">You {you}/{rows.length} · Rehearsal {model}/{rows.length} · <span className="font-semibold text-ink">{pts} pts</span></p>}
      </div>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-panel">
        {rows.map(({ c, o, actual, s }) => (
          <li key={c.ticker} className="flex items-center gap-3 px-4 py-3 text-[14px]">
            <TokenIcon src={icons[c.ticker]} symbol={c.ticker} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{c.ticker} <span className="font-normal text-muted">· you said {c.dir > 0 ? "up" : "down"}{c.pct != null ? ` ${fmtPct(c.pct, 1)}` : ""}</span></span>
              <span className="num block text-[12.5px] text-muted">
                {c.modelPct != null ? `Rehearsal ${fmtPct(c.modelPct)} · ` : ""}
                {actual != null ? <>opened <span className="font-medium text-ink">{fmtPct(actual)}</span></> : o ? "waiting for the open" : data ? "opens at 9:30 AM New York" : "checking…"}
              </span>
            </span>
            {s && <Pill tone={s.right ? "good" : "bad"}>{s.right ? `+${s.total}` : "Miss"}</Pill>}
          </li>
        ))}
      </ul>
      {complete && (
        <ShareRow query={shareQuery({ round, calls: calls.map((c) => ({ ticker: c.ticker, dir: c.dir, pct: c.pct })), you: [you, rows.length], model: [model, rows.length], pts })}
          text={`Monday Call: I got ${you}/${rows.length} opens right${you > model ? ", beating Rehearsal's model" : ""}. ${pts} pts. Your turn:`} />
      )}
      {!complete && <p className="num text-[12.5px] text-muted">Scored from each stock&apos;s official open. Checked again every two minutes · {nyTime(now)} New York now.</p>}
    </section>
  );
}
