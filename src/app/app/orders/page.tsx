"use client";
import { useEffect, useState } from "react";
import { useAssets } from "@/lib/hooks";
import { Button, cx, PageHeader, Pill, Segmented, TokenIcon } from "@/components/ui";

const GUARD_ID = process.env.NEXT_PUBLIC_GUARD_PROGRAM_ID ?? "TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE";

function session(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const hm = Number(p.hour) * 100 + Number(p.minute);
  const wk = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(p.weekday);
  if (wk && hm >= 930 && hm < 1600) return { open: true, label: "Market open", note: "Orders fill as soon as a market maker matches your price." };
  if ((wk && hm >= 400 && hm < 930) || (wk && hm >= 1600 && hm < 2000)) return { open: true, label: "Extended hours", note: "Orders fill as soon as a market maker matches your price." };
  if ((["Sun", "Mon", "Tue", "Wed", "Thu"].includes(p.weekday) && hm >= 2000) || (wk && hm < 400)) return { open: true, label: "Overnight session", note: "Orders fill as soon as a market maker matches your price." };
  return { open: false, label: "Market closed", note: "Orders placed now wait, then fill together at the first real price on Sunday 8pm ET." };
}

// Minutes until 4:00 PM New York today, or null outside a weekday before the bell.
function toClose(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(p.weekday)) return null;
  const left = 16 * 60 - (Number(p.hour) * 60 + Number(p.minute));
  return left > 0 ? left : null;
}
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
type When = "now" | "open" | "close";

export default function Orders() {
  const { data: assets } = useAssets();
  const [s, setS] = useState<ReturnType<typeof session> | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [limit, setLimit] = useState("0.5");
  const [when, setWhen] = useState<When>("now");
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => { const tick = () => { setS(session()); setLeft(toClose()); }; const a = setTimeout(tick, 0); const b = setInterval(tick, 60_000); return () => { clearTimeout(a); clearInterval(b); }; }, []);
  const nvda = assets?.find((a) => a.symbol === "NVDAx");

  return (
    <div className="space-y-10">
      <PageHeader title="Limit orders" sub="Fill at fair value, at the open, or at the close." right={<Pill tone="neutral">Devnet</Pill>} />

      <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
        <section aria-label="New order" className="h-fit rounded-xl border border-line bg-panel p-5">
          <div className="flex items-center gap-3 rounded-lg bg-surface px-4 py-3">
            <TokenIcon src={nvda?.icon} symbol="NVDAx" size={32} />
            <span><span className="block text-[15px] font-semibold">NVIDIA</span><span className="block text-[12px] text-muted">NVDAx</span></span>
          </div>
          <div className="mt-5 space-y-5">
            <Segmented label="Side" value={side} onChange={setSide} options={[{ value: "buy", label: "Buy" }, { value: "sell", label: "Sell" }]} />
            <div>
              <span className="text-[12.5px] text-muted">Max over fair</span>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {["0.1", "0.25", "0.5", "1"].map((v) => (
                  <button key={v} onClick={() => setLimit(v)}
                    className={cx("num h-9 rounded-md border text-[13.5px] font-medium transition-colors", limit === v ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-line-strong")}>
                    {v}%
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-[12.5px] text-muted">Fills</span>
              <Segmented label="When it fills" value={when} onChange={setWhen}
                options={[{ value: "now", label: "When matched" }, { value: "open", label: "At the open" }, { value: "close", label: "At the close" }]} />
              <p className="mt-2 text-[12.5px] text-muted">
                {when === "now" && "Any market maker, within your limit."}
                {when === "open" && "At the first real price after the reopen."}
                {when === "close" && "At the 4:00 PM price, with other at-close orders."}
              </p>
            </div>
            <Button size="lg" className="w-full" disabled>Available on mainnet soon</Button>
            <p className="text-center text-[12.5px] text-muted">
              <a className="text-brand-ink hover:underline" href={`https://explorer.solana.com/address/${GUARD_ID}?cluster=devnet`} target="_blank" rel="noreferrer">Order program on devnet</a>
            </p>
          </div>
        </section>

        <section aria-labelledby="how" className="space-y-8">
          <div>
            <h2 id="how" className="text-[15px] font-semibold">How it works</h2>
            <ol className="mt-4 space-y-5">
              {[
                ["Set a limit", "Your USDC waits in on-chain escrow."],
                ["Makers compete", "Every fill is checked against the real price."],
                ["Weekends wait", "Closed-market orders fill at the reopen price."],
                ["Or take the close", "Matched at the 4:00 PM price."],
              ].map(([t, d], i) => (
                <li key={t} className="grid grid-cols-[32px_1fr] gap-3">
                  <span className="num grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-[13px] font-medium text-ink-2">{i + 1}</span>
                  <span><span className="block text-[14px] font-medium">{t}</span><span className="block text-[13.5px] text-muted">{d}</span></span>
                </li>
              ))}
            </ol>
          </div>

          {s && (
            <div className="rounded-xl border border-line p-5">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold">Right now</span>
                <Pill tone={s.open ? "good" : "warn"}>{s.label}</Pill>
              </div>
              <p className="mt-2 text-[14px] text-ink-2">{s.note}</p>
              {left != null && <p className="mt-2 text-[14px] text-ink-2">Today&apos;s closing cross starts in <span className="num font-semibold text-ink">{hm(left)}</span>.</p>}
            </div>
          )}

        </section>
      </div>
    </div>
  );
}
