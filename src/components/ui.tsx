"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Tone } from "@/lib/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-[-0.02em] text-ink", className)}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="6" fill="var(--brand)" />
        <path d="M5 15.5 9.5 11l3 3L19 7.5" fill="none" stroke="var(--on-brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 18.5h14" stroke="var(--on-brand)" strokeOpacity=".45" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="text-[16px]">Rehearsal</span>
    </span>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover disabled:bg-surface-2 disabled:text-muted",
  secondary: "border border-line bg-panel text-ink hover:border-line-strong hover:bg-surface disabled:text-muted",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink disabled:text-muted",
  danger: "bg-bad text-on-brand hover:opacity-90 disabled:bg-surface-2 disabled:text-muted",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }>(
  function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }, ref) {
    const sizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-[14px]", lg: "h-12 px-5 text-[15px]" };
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cx(
          "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background-color,border-color,color,opacity] duration-150 ease-out disabled:cursor-not-allowed",
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
  neutral: <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />,
};

// Status badge: color plus an icon and a word, never color alone.
export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[12px] font-medium", toneClass[tone], className)}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {toneIcon[tone]}
      </svg>
      {children}
    </span>
  );
}
export const toneText: Record<Tone, string> = { good: "text-good", warn: "text-warn", bad: "text-bad", neutral: "text-muted" };

/** One inline message for errors, warnings and confirmations. Always a sentence, never a raw error. */
export function Notice({ tone, children, action, className }: { tone: Tone; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-[13.5px] leading-snug", toneClass[tone], className)}>
      <svg className="mt-px shrink-0" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" strokeWidth="1.4" />
        {tone === "good" ? <path d="m5.5 8.2 1.8 1.8 3.3-3.6" /> : tone === "neutral" ? <path d="M8 7.5v3.5M8 5.2v.1" /> : <path d="M8 4.8v3.6M8 10.9v.1" />}
      </svg>
      <span className="min-w-0 flex-1 break-words text-ink">{children}</span>
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, size = "md" }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "whitespace-nowrap rounded-md px-3 font-medium transition-colors duration-150",
            size === "sm" ? "h-7 text-[13px]" : "h-8 text-[13.5px]",
            value === o.value ? "bg-panel text-ink shadow-[0_1px_2px_oklch(0_0_0/0.08)]" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Title row shared by every app screen: one heading, at most one short line, status or actions on the right. */
export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight text-ink">{title}</h1>
        {sub && <p className="mt-1 text-[14px] text-muted">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </header>
  );
}

/** Underlined tabs that switch between sibling routes. */
export function RouteTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="Sections" className="-mb-px flex gap-6 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {tabs.map((t) => {
        const on = path === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
            className={cx("whitespace-nowrap border-b-2 pb-2.5 text-[14px] font-medium transition-colors", on ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** A plain bordered surface. Use once per group, never nested. */
export function Panel({ children, className, as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" } & Record<string, unknown>) {
  return <As className={cx("rounded-xl border border-line bg-panel", className)} {...rest}>{children}</As>;
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx("skeleton block", className)} />;
}

export function TokenIcon({ src, symbol, size = 32 }: { src?: string; symbol: string; size?: number }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) {
    return (
      <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-ink-2">
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
      className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {pref === "light" && <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
        {pref === "dark" && <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />}
        {pref === "system" && <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>}
      </svg>
    </button>
  );
}

export function InfoTip({ children, label = "More info" }: { children: ReactNode; label?: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-label={label} className="grid h-4 w-4 place-items-center rounded-full text-muted hover:text-ink">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.25" /><path d="M8 7.25v4M8 5v.25" strokeLinecap="round" /></svg>
      </button>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-[var(--z-dropdown)] mb-2 hidden w-max max-w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-left text-[12.5px] font-normal leading-snug text-bg shadow-card group-focus-within:block group-hover:block">
        {children}
      </span>
    </span>
  );
}
