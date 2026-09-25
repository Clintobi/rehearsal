"use client";
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Tone } from "@/lib/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-tight text-ink", className)}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="7" fill="var(--brand)" />
        <path d="M5 15.5 9.5 11l3 3L19 7.5" fill="none" stroke="var(--on-brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 18.5h14" stroke="var(--on-brand)" strokeOpacity=".45" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="text-[17px]">Rehearsal</span>
    </span>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover disabled:bg-line-strong disabled:text-muted",
  secondary: "bg-surface-2 text-ink hover:bg-line disabled:text-muted",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink disabled:text-muted",
  danger: "bg-bad text-on-brand hover:opacity-90 disabled:bg-line-strong disabled:text-muted",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }>(
  function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }, ref) {
    const sizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-[14px]", lg: "h-12 px-5 text-[15px]" };
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cx(
          "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,color,opacity,transform] duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed",
          sizes[size], variants[variant], className,
        )}
        {...rest}
      >
        {loading && <Spinner />}
        {children}
      </button>
    );
  },
);

export function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const toneClass: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-surface-2 text-ink-2",
};
const toneIcon: Record<Tone, ReactNode> = {
  good: <path d="m4.5 8.5 2.5 2.5 5-5.5" />,
  warn: <><path d="M8 4.5v4" /><path d="M8 11.25v.25" /></>,
  bad: <><path d="m5 5 6 6" /><path d="m11 5-6 6" /></>,
  neutral: <path d="M4.5 8h7" />,
};

// Status pill: color plus an icon and a word, never color alone.
export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold", toneClass[tone], className)}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {toneIcon[tone]}
      </svg>
      {children}
    </span>
  );
}
export const toneText: Record<Tone, string> = { good: "text-good", warn: "text-warn", bad: "text-bad", neutral: "text-muted" };

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-full bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-9 rounded-full text-[14px] font-semibold transition-colors duration-150",
            value === o.value ? "bg-panel text-ink ring-1 ring-line" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx("skeleton block", className)} />;
}

export function TokenIcon({ src, symbol, size = 32 }: { src?: string; symbol: string; size?: number }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) {
    return (
      <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-bold text-ink-2">
        {symbol.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} onError={() => setOk(false)} style={{ width: size, height: size }} className="shrink-0 rounded-full bg-surface-2 object-cover" />;
}

type ThemePref = "system" | "light" | "dark";
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("theme"); } catch {}
    const t = setTimeout(() => setPref(saved === "light" || saved === "dark" ? saved : "system"), 0);
    return () => clearTimeout(t);
  }, []);
  const apply = (p: ThemePref) => {
    setPref(p);
    const el = document.documentElement;
    if (p === "system") delete el.dataset.theme; else el.dataset.theme = p;
    try { if (p === "system") localStorage.removeItem("theme"); else localStorage.setItem("theme", p); } catch {}
  };
  const next: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
  const label = { system: "Theme: system", light: "Theme: light", dark: "Theme: dark" }[pref];
  return (
    <button onClick={() => apply(next[pref])} aria-label={label} title={label}
      className="grid h-9 w-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {pref === "light" && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
        {pref === "dark" && <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />}
        {pref === "system" && <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>}
      </svg>
    </button>
  );
}

export function InfoTip({ children, label = "More info" }: { children: ReactNode; label?: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={label} className="grid h-4 w-4 place-items-center rounded-full text-muted hover:text-ink">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.25" /><path d="M8 7.25v4M8 5v.25" strokeLinecap="round" /></svg>
      </button>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-[var(--z-dropdown)] mb-2 w-64 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-[12.5px] font-normal leading-snug text-bg opacity-0 shadow-card transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
        {children}
      </span>
    </span>
  );
}
