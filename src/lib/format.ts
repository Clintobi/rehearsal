export const usd = (n: number, digits?: number) => {
  const d = digits ?? (Math.abs(n) >= 1000 ? 0 : 2);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
};
export const price = (n: number) => usd(n, n >= 1000 ? 2 : n >= 1 ? 2 : 4);
export const pct = (n: number, digits = 2) =>
  Math.abs(n) < 0.5 * 10 ** -digits ? `${(0).toFixed(digits)}%` : `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}%`;
export const signedUsd = (n: number) => `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;
export const compactUsd = (v: number) =>
  v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : usd(v, 0);
export const shortAddr = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
export const ago = (unixSec: number) => {
  const m = Math.max(0, Math.round((Date.now() / 1000 - unixSec) / 60));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export type Tone = "good" | "warn" | "bad" | "neutral";
// Gap in percent (+ = worse for the trader). xStocks are held to a tighter standard than pre-IPO tokens.
export function gapTone(gapPct: number | null | undefined, kind: "xstock" | "prestock" | string = "xstock"): Tone {
  if (gapPct == null) return "neutral";
  const [warn, bad] = kind === "prestock" ? [5, 15] : [0.75, 3];
  if (gapPct >= bad) return "bad";
  if (gapPct >= warn) return "warn";
  return "good";
}
