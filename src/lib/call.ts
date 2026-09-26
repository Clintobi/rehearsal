// Monday Call: call where a stock opens next, against Rehearsal's weekend forecast.
// Client-safe: scoring, the New York clock for rounds, local storage and share links.
// No server state yet; calls live in the player's browser until accounts exist.

export type Dir = 1 | -1;

/** One past weekend, for practice. Moves are fractions (0.01 = +1%). */
export type PracticeCard = {
  symbol: string; ticker: string; name: string; icon: string;
  fri: string; mon: string; closeFri: number; openMon: number;
  tokenMove: number; actualMove: number;
};

/** A call on the live round. Model move is Rehearsal's forecast when the call was made. */
export type LiveCall = {
  round: string; symbol: string; ticker: string; dir: Dir; pct: number | null;
  modelPct: number | null; at: number;
};

export type Score = {
  right: boolean; flat: boolean; modelRight: boolean | null;
  base: number; closeness: number; beatModel: number; total: number;
};

// A move smaller than this is "flat": neither side loses.
export const FLAT = 0.0005;

/** Points for one call. `guessPct`, `actualPct` and `modelPct` are in percent. */
export function score(dir: Dir, guessPct: number | null, actualPct: number, modelPct: number | null): Score {
  const flat = Math.abs(actualPct) < FLAT * 100;
  const right = flat || Math.sign(actualPct) === dir;
  const modelRight = modelPct == null ? null : flat || Math.sign(modelPct) === Math.sign(actualPct);
  const base = flat ? 5 : right ? 10 : 0;
  // One point off per 0.1 point of miss, when an exact move was called in the right direction.
  const closeness = guessPct != null && right ? Math.max(0, Math.round(10 - Math.abs(guessPct - actualPct) * 10)) : 0;
  let beatModel = 0;
  if (modelPct != null && right) {
    if (guessPct != null) beatModel = Math.abs(guessPct - actualPct) < Math.abs(modelPct - actualPct) ? 5 : 0;
    else beatModel = modelRight ? 0 : 5;
  }
  return { right, flat, modelRight, base, closeness, beatModel, total: base + closeness + beatModel };
}

// ---------------------------------------------------------------- New York clock

const nyParts = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).formatToParts(d).map((x) => [x.type, x.value]));

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export type RoundState =
  | { phase: "open"; locksAt: Date; weekend: boolean }
  | { phase: "locked"; opensAt: Date };

/** Minutes since midnight New York for a date. */
const nyMinutes = (d: Date) => { const p = nyParts(d); return Number(p.hour) * 60 + Number(p.minute); };

/** Next moment at hh:mm New York on a weekday, from `from`. Holidays are not handled. */
function nextNy(from: Date, hh: number, mm: number) {
  for (let i = 0; i < 8 * 24 * 4; i++) {
    const t = new Date(Math.ceil(from.getTime() / 900_000) * 900_000 + i * 900_000);
    const p = nyParts(t);
    if (WEEKDAYS.includes(p.weekday) && Number(p.hour) === hh && Number(p.minute) === mm) return t;
  }
  return from;
}

/**
 * Calls are open from the 4 PM close until 9:00 the next weekday morning, so nobody can
 * copy the pre-market. Between 9:00 and 4 PM on weekdays the round is locked.
 */
export function roundState(now = new Date()): RoundState {
  const p = nyParts(now);
  const m = nyMinutes(now);
  const weekday = WEEKDAYS.includes(p.weekday);
  if (weekday && m >= 9 * 60 && m < 16 * 60) return { phase: "locked", opensAt: nextNy(now, 16, 0) };
  const locksAt = nextNy(now, 9, 0);
  const lp = nyParts(locksAt);
  return { phase: "open", locksAt, weekend: lp.weekday === "Mon" };
}

export function until(t: Date, now = new Date()) {
  const min = Math.max(0, Math.round((t.getTime() - now.getTime()) / 60_000));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), mm = min % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
}

// ---------------------------------------------------------------- local storage

const KEY = "rehearsal.call.v1";
// `scored` lists rounds already counted toward the streak.
type Saved = { calls: LiveCall[]; practiceBest: number; streak: number; scored: string[] };
const empty: Saved = { calls: [], practiceBest: 0, streak: 0, scored: [] };

export function load(): Saved {
  try { return { ...empty, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { ...empty }; }
}
export function save(s: Partial<Saved>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...load(), ...s })); } catch { /* private mode: play still works */ }
}

// ---------------------------------------------------------------- share links

/** Query string shared by the /c page and its image. */
export function shareQuery(p: { name?: string; round?: string; calls?: { ticker: string; dir: Dir; pct: number | null }[]; you?: [number, number]; model?: [number, number]; pts?: number }) {
  const q = new URLSearchParams();
  if (p.name) q.set("n", p.name.slice(0, 24));
  if (p.round) q.set("r", p.round);
  if (p.calls?.length) q.set("c", p.calls.slice(0, 6).map((c) => `${c.ticker}:${c.dir > 0 ? "u" : "d"}${c.pct != null ? `:${c.pct}` : ""}`).join(","));
  if (p.you) q.set("y", p.you.join("-"));
  if (p.model) q.set("m", p.model.join("-"));
  if (p.pts != null) q.set("p", String(p.pts));
  return q.toString();
}

export type Shared = { name: string | null; round: string | null; calls: { ticker: string; dir: Dir; pct: number | null }[]; you: [number, number] | null; model: [number, number] | null; pts: number | null };

export function parseShare(get: (k: string) => string | null | undefined): Shared {
  const pair = (s: string | null | undefined) => {
    const m = s?.match(/^(\d{1,3})-(\d{1,3})$/);
    return m ? [Number(m[1]), Number(m[2])] as [number, number] : null;
  };
  const calls = (get("c") ?? "").split(",").filter(Boolean).slice(0, 6).flatMap((s) => {
    const [ticker, d, pct] = s.split(":");
    if (!/^[A-Z.]{1,6}$/.test(ticker ?? "") || !["u", "d"].includes(d)) return [];
    const n = pct != null ? Number(pct) : null;
    return [{ ticker, dir: (d === "u" ? 1 : -1) as Dir, pct: n != null && Number.isFinite(n) && Math.abs(n) < 50 ? n : null }];
  });
  const name = (get("n") ?? "").replace(/[^\p{L}\p{N} _.-]/gu, "").slice(0, 24) || null;
  const round = /^\d{4}-\d{2}-\d{2}$/.test(get("r") ?? "") ? get("r")! : null;
  const pts = Number(get("p"));
  return { name, round, calls, you: pair(get("y")), model: pair(get("m")), pts: Number.isFinite(pts) && get("p") ? Math.max(0, Math.min(9999, Math.round(pts))) : null };
}

export const fmtPct = (n: number, d = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}%`;
export const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
