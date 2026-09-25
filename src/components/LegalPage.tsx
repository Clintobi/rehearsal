import Link from "next/link";
import Footer from "./Footer";
import { Logo } from "./ui";

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6"><Link href="/" aria-label="Rehearsal home"><Logo /></Link></header>
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        <h1 className="text-[28px] font-semibold">{title}</h1>
        <p className="mt-2 text-[13px] text-muted">Last updated {updated}</p>
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink-2 [&_h2]:mt-10 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h2]:text-ink [&_a]:text-brand-ink [&_a:hover]:underline">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
