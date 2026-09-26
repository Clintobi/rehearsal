"use client";
import { useEffect, useState } from "react";
import { PageHeader, Segmented } from "@/components/ui";
import { load, roundState, type PracticeCard } from "@/lib/call";
import LiveRound from "./LiveRound";
import Practice from "./Practice";

type Tab = "live" | "practice";

export default function CallGame({ deck }: { deck: PracticeCard[] }) {
  const [tab, setTab] = useState<Tab | null>(null);
  // Open on the live round when it's taking calls or has results; otherwise start with practice.
  useEffect(() => {
    const t = setTimeout(() => setTab(roundState().phase === "open" || load().calls.length ? "live" : "practice"), 0);
    return () => clearTimeout(t);
  }, []);
  const go = (t: Tab) => { setTab(t); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="space-y-6">
      <PageHeader title="Monday Call" sub="Stocks keep trading as tokens all weekend. Call where they open, against Rehearsal's forecast." />
      <ol className="grid gap-2 text-[13px] text-muted sm:grid-cols-3">
        {["Call up or down. No money, no sign-up.", "See what Rehearsal's weekend forecast says.", "Scored at the 9:30 AM New York open."].map((s, i) => (
          <li key={i} className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2">
            <span className="num grid h-5 w-5 shrink-0 place-items-center rounded-full bg-panel text-[11.5px] font-semibold text-ink">{i + 1}</span>{s}
          </li>
        ))}
      </ol>
      <div className="max-w-xs">
        <Segmented label="Mode" value={tab ?? "live"} onChange={go} options={[{ value: "live", label: "This round" }, { value: "practice", label: "Practice" }]} />
      </div>
      {tab === "live" && <LiveRound onPractice={() => go("practice")} />}
      {tab === "practice" && <Practice deck={deck} onLive={() => go("live")} />}
    </div>
  );
}
