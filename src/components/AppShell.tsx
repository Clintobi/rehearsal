"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx, Logo, ThemeToggle } from "./ui";
import Tour, { openTour } from "./Tour";

const WalletMultiButton = dynamic(() => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton), { ssr: false });

// Six destinations (five on phones, where Report sits in the footer). Pre-IPO and Weekend live inside Markets; Orders inside Portfolio.
const NAV = [
  { href: "/app/call", label: "Call", match: ["/app/call"], icon: <path d="M8 20V4M4 8l4-4 4 4M16 4v16M12 16l4 4 4-4" /> },
  { href: "/app", label: "Trade", match: ["/app"], icon: <path d="M4 16l5-5 4 4 7-7M14 8h6v6" /> },
  { href: "/app/markets", label: "Markets", match: ["/app/markets", "/app/private", "/app/weekend"], icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
  { href: "/app/earn", label: "Earn", match: ["/app/earn"], icon: <><circle cx="12" cy="12" r="8.5" /><path d="M14.8 9.3c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1.2 1.7 2.8 2.1c1.6.4 2.8.9 2.8 2.1s-1.2 2-2.8 2c-1.3 0-2.4-.5-2.9-1.4M12 6.4v1.5M12 16.1v1.5" /></> },
  { href: "/app/portfolio", label: "Portfolio", match: ["/app/portfolio", "/app/orders"], icon: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M16 13h2M3 10h18" /></> },
  { href: "/report", label: "Report", match: ["/report"], desktopOnly: true, icon: <><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6M9 14h8M9 18h5" /></> },
];

function active(path: string, match: string[]) {
  return match.some((m) => (m === "/app" ? path === "/app" : path.startsWith(m)));
}

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "";
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-4 sm:px-6">
          <Link href="/" aria-label="Rehearsal home"><Logo /></Link>
          <nav aria-label="Main" className="hidden h-full items-center gap-6 md:flex">
            {NAV.map((n) => {
              const on = active(path, n.match);
              return (
                <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
                  className={cx("relative flex h-full items-center text-[14px] font-medium transition-colors",
                    on ? "text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-ink" : "text-muted hover:text-ink")}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={openTour} aria-label="Take the tour" title="Take the tour"
              className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17.2v.1" /></svg>
            </button>
            <ThemeToggle />
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <main key={path} className="page-in mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6 md:pb-20 md:pt-12">{children}</main>
      <Tour />

      <footer className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 md:pb-0">
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line py-6 text-[12.5px] text-muted">
          <span>Not investment advice.</span>
          <Link href="/report" className="hover:text-ink md:hidden">Report</Link>
          <Link href="/agents" className="hover:text-ink">API</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
        </div>
      </footer>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="grid grid-cols-5">
          {NAV.filter((n) => !("desktopOnly" in n)).map((n) => {
            const on = active(path, n.match);
            return (
              <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
                className={cx("flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-medium", on ? "text-ink" : "text-muted")}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{n.icon}</svg>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
