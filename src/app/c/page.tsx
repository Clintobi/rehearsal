import type { Metadata } from "next";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { fmtDay, fmtPct, parseShare } from "@/lib/call";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const qs = (sp: Record<string, string | string[] | undefined>) => {
  const q = new URLSearchParams();
  for (const k of ["n", "r", "c", "y", "m", "p"]) { const v = one(sp[k]); if (v) q.set(k, v); }
  return q.toString();
};

// A shared Monday Call: the link unfurls as the card image, and the page invites a reply.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const s = parseShare((k) => one(sp[k]));
  const title = s.you ? `${s.you[0]} of ${s.you[1]} Monday opens called right` : "My Monday Call";
  const image = `/api/call/card?${qs(sp)}`;
  return {
    title,
    description: "Stocks trade as tokens all weekend. Call where they open on Monday, against Rehearsal's forecast. Free.",
    openGraph: { title, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

export default async function SharedCall({ searchParams }: Props) {
  const sp = await searchParams;
  const s = parseShare((k) => one(sp[k]));
  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-6">
        <div className="card-in rounded-2xl border border-line bg-panel p-6 sm:p-8">
          <p className="text-[13px] font-medium text-muted">Monday Call{s.round ? ` · round of ${fmtDay(s.round)}` : ""}</p>
          {s.you ? (
            <>
              <h1 className="mt-1 text-[28px] font-semibold leading-tight">{s.name ?? "Someone"} called {s.you[0]} of {s.you[1]} opens right</h1>
              <p className="num mt-2 text-[15px] text-muted">
                {s.model && <>Rehearsal&apos;s model got {s.model[0]} of {s.model[1]}. </>}
                {s.pts != null && <>{s.pts} points.</>}
              </p>
            </>
          ) : (
            <h1 className="mt-1 text-[28px] font-semibold leading-tight">{s.name ? `${s.name}'s calls` : "Here are my calls"}</h1>
          )}
          {s.calls.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {s.calls.map((c) => (
                <li key={c.ticker} className={`num rounded-lg px-3 py-1.5 text-[14px] font-medium ${c.dir > 0 ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
                  {c.ticker} {c.dir > 0 ? "up" : "down"}{c.pct != null ? ` ${fmtPct(c.pct, 1)}` : ""}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-6 text-[15px] leading-relaxed text-ink-2">
            US stocks keep trading as tokens on Solana all weekend. Call where they open on Monday and see if you can beat Rehearsal&apos;s forecast. Free, and no sign-up.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/app/call" className="inline-flex h-12 items-center rounded-lg bg-brand px-5 text-[15px] font-medium text-on-brand transition-colors hover:bg-brand-hover">Make your call</Link>
            <Link href="/app/weekend" className="inline-flex h-12 items-center rounded-lg border border-line bg-panel px-5 text-[15px] font-medium text-ink transition-colors hover:bg-surface">See the forecast</Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
