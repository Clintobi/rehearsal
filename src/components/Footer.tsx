import Link from "next/link";
import { Logo } from "./ui";

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-[13px] text-muted sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Logo />
          <p>Not a broker. Not investment advice.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/app/markets" className="hover:text-ink">Markets</Link>
          <Link href="/app/earn" className="hover:text-ink">Earn</Link>
          <Link href="/report" className="hover:text-ink">Report</Link>
          <Link href="/agents" className="hover:text-ink">API</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <a href="https://github.com/Clintobi/rehearsal" className="hover:text-ink" target="_blank" rel="noreferrer">Code</a>
        </nav>
      </div>
    </footer>
  );
}
