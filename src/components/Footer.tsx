import Link from "next/link";
import { Logo } from "./ui";

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-[13px] text-muted sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Logo />
          <p className="max-w-md">Rehearsal shows prices and can cancel trades that miss your limit. It isn&apos;t a broker and doesn&apos;t give investment advice.</p>
        </div>
        <nav aria-label="Legal" className="flex flex-wrap gap-5">
          <Link href="/agents" className="hover:text-ink">For agents</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <a href="https://github.com/Clintobi/rehearsal" className="hover:text-ink" target="_blank" rel="noreferrer">Code</a>
        </nav>
      </div>
    </footer>
  );
}
