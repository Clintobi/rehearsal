"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx, Logo, ThemeToggle } from "./ui";

const WalletMultiButton = dynamic(() => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton), { ssr: false });

const NAV = [
  { href: "/app", label: "Trade", icon: <path d="M4 16l5-5 4 4 7-7M14 8h6v6" /> },
  { href: "/app/markets", label: "Markets", icon: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></> },
  { href: "/app/portfolio", label: "Portfolio", icon: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M16 13h2M3 10h18" /></> },
  { href: "/app/orders", label: "Orders", icon: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></> },
  { href: "/report", label: "Report", icon: <><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6M9 14h8M9 18h5" /></> },
];

function active(path: string, href: string) {
  return href === "/app" ? path === "/app" : path.startsWith(href);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "";
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Rehearsal home"><Logo /></Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(path, n.href) ? "page" : undefined}
                className={cx("rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors",
                  active(path, n.href) ? "bg-surface-2 text-ink" : "text-muted hover:text-ink")}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6 md:pt-10">{children}</main>
      <footer className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-2 px-4 pb-28 pt-6 text-[12px] text-muted sm:px-6 md:pb-10">
        <span>Not investment advice. Prices can change before your trade lands.</span>
        <Link href="/terms" className="hover:text-ink">Terms</Link>
        <Link href="/privacy" className="hover:text-ink">Privacy</Link>
      </footer>

      {/* Mobile tab bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="grid grid-cols-5">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(path, n.href) ? "page" : undefined}
              className={cx("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                active(path, n.href) ? "text-brand-ink" : "text-muted")}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{n.icon}</svg>
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
