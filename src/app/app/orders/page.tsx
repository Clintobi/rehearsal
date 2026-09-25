"use client";
import { useEffect, useState } from "react";
import { useAssets } from "@/lib/hooks";
import { Button, cx, Pill, Segmented, TokenIcon } from "@/components/ui";

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

export default function Orders() {
  const { data: assets } = useAssets();
  const [s, setS] = useState<ReturnType<typeof session> | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [limit, setLimit] = useState("0.5");
  const [waitForOpen, setWaitForOpen] = useState(false);
  useEffect(() => { const tick = () => setS(session()); const a = setTimeout(tick, 0); const b = setInterval(tick, 60_000); return () => { clearTimeout(a); clearInterval(b); }; }, []);
  const nvda = assets?.find((a) => a.symbol === "NVDAx");

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Orders</h1>
          <p className="mt-1 max-w-[62ch] text-[15px] text-muted">Set the most you&apos;ll pay above the real price. Market makers compete to fill you, and they can never go past your limit.</p>
        </div>
        {s && <Pill tone={s.open ? "good" : "warn"}>{s.label}</Pill>}
      </header>

      <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
        <section aria-label="New order" className="h-fit rounded-[10px] border border-line bg-panel p-5 sm:p-6">
          <div className="flex items-center gap-3 rounded-lg bg-surface px-4 py-3">
            <TokenIcon src={nvda?.icon} symbol="NVDAx" size={32} />
            <span><span className="block text-[15px] font-semibold">NVIDIA</span><span className="block text-[12px] text-muted">NVDAx</span></span>
          </div>
          <div className="mt-5 space-y-5">
            <Segmented label="Side" value={side} onChange={setSide} options={[{ value: "buy", label: "Buy" }, { value: "sell", label: "Sell" }]} />
            <div>
              <span className="text-[13px] font-medium text-muted">Most you&apos;ll pay above the real price</span>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {["0.1", "0.25", "0.5", "1"].map((v) => (
                  <button key={v} onClick={() => setLimit(v)}
                    className={cx("num h-10 rounded-full border text-[14px] font-semibold transition-colors", limit === v ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-line-strong")}>
                    {v}%
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={waitForOpen} onChange={(e) => setWaitForOpen(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
              <span className="text-[14px]"><span className="font-semibold">Wait for the market to open</span><span className="block text-muted">Skip weekend prices and fill at the first real price after the open.</span></span>
            </label>
            <Button size="lg" className="w-full" disabled>Place order</Button>
            <p className="text-center text-[13px] text-muted">
              Orders go live with the mainnet launch. The order program is running on{" "}
              <a className="text-brand-ink hover:underline" href={`https://explorer.solana.com/address/${GUARD_ID}?cluster=devnet`} target="_blank" rel="noreferrer">devnet</a>.
            </p>
          </div>
        </section>

        <section aria-labelledby="how" className="space-y-8">
          <div>
            <h2 id="how" className="text-[17px] font-semibold">How an order fills</h2>
            <ol className="mt-4 space-y-5">
              {[
                ["You set a limit, not a price", "Your USDC waits in an on-chain escrow. The limit follows the live price of the real stock, so it's always current."],
                ["Market makers compete", "Anyone can fill your order, but every fill is checked against the real price in the same transaction. A fill past your limit fails. A fill below the real price is yours to keep."],
                ["Weekends wait for Monday", "If the market's closed, your order doesn't touch weekend prices. When trading resumes, everyone waiting is matched at one price: the first real one."],
              ].map(([t, d], i) => (
                <li key={t} className="grid grid-cols-[32px_1fr] gap-3">
                  <span className="num grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-[14px] font-semibold text-brand-ink">{i + 1}</span>
                  <span><span className="block text-[15px] font-semibold">{t}</span><span className="mt-1 block max-w-[62ch] text-[14px] text-ink-2">{d}</span></span>
                </li>
              ))}
            </ol>
          </div>

          {s && (
            <div className="rounded-[10px] border border-line bg-panel p-5">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold">Right now</span>
                <Pill tone={s.open ? "good" : "warn"}>{s.label}</Pill>
              </div>
              <p className="mt-2 text-[14px] text-ink-2">{s.note}</p>
            </div>
          )}

          <p className="text-[13px] text-muted">
            Tested against real mainnet data: a fill at 0.2% over fair went through, one at 2% over was refused, and a weekend buyer and seller were matched at exactly the reopen price.{" "}
            <a className="text-brand-ink hover:underline" href="https://github.com/Clintobi/rehearsal/blob/main/docs/fork-orders-test-output.txt" target="_blank" rel="noreferrer">Test results</a>
          </p>
        </section>
      </div>
    </div>
  );
}
