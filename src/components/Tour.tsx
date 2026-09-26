"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cx, Pill } from "./ui";

const KEY = "rh-tour-v1";
export const openTour = () => window.dispatchEvent(new Event("rh:tour"));

type Step = { title: string; body: string; visual: ReactNode };

const STEPS: Step[] = [
  {
    title: "The real price, before you buy.",
    body: "Every stock shows how its token compares with the real stock, in dollars.",
    visual: (
      <div className="rounded-xl border border-line bg-panel p-4 shadow-card">
        <Pill tone="good">Fair price</Pill>
        <p className="mt-2.5 text-[19px] font-semibold leading-tight">You&apos;re getting the real price</p>
        <div className="relative mt-5 h-7">
          <div className="absolute inset-x-0 top-3 h-1 rounded-full bg-surface-2" />
          <div className="absolute left-[44%] top-3 h-1 w-[10%] rounded-full bg-good/45" />
          <span className="absolute left-[44%] top-[7px] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-ink ring-4 ring-panel" />
          <span className="absolute left-[54%] top-[7px] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-good ring-4 ring-panel" />
        </div>
        <div className="mt-1 flex justify-between text-[12px] text-muted"><span>Real <b className="num text-ink">$224.87</b></span><span>You pay <b className="num text-ink">$225.02</b></span></div>
      </div>
    ),
  },
  {
    title: "Protection on every order.",
    body: "Set a limit. If the fill comes in worse, the trade cancels on-chain and nothing moves.",
    visual: (
      <div className="rounded-xl border border-line bg-panel p-4 shadow-card">
        <div className="flex items-center justify-between text-[14px]">
          <span className="font-medium">Price protection</span>
          <span className="relative h-5 w-9 rounded-full bg-brand"><span className="absolute left-0 top-0.5 h-4 w-4 translate-x-[18px] rounded-full bg-white shadow" /></span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-0.5 rounded-lg bg-surface-2 p-0.5 text-center text-[12.5px]">
          {["0.25%", "0.50%", "1%", "3%"].map((v) => <span key={v} className={cx("rounded-md py-1.5", v === "0.50%" ? "bg-panel font-medium shadow-[0_1px_2px_oklch(0_0_0/0.08)]" : "text-muted")}>{v}</span>)}
        </div>
        <p className="num mt-2.5 text-[12.5px] text-muted">Cancels if above $225.99</p>
      </div>
    ),
  },
  {
    title: "See Monday's move on Sunday.",
    body: "When the market is shut, we forecast where each stock opens, and publish how often we're right.",
    visual: (
      <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-card">
        {[["NVDA", "$226.10", "+0.48%"], ["TSLA", "$374.02", "+0.51%"], ["SPY", "$771.40", "+0.12%"]].map(([t, p, c]) => (
          <div key={t} className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[14px] last:border-0">
            <span className="font-medium">{t}</span>
            <span className="text-right"><span className="num block font-semibold">{p}</span><span className="num block text-[12px] text-good">{c}</span></span>
          </div>
        ))}
      </div>
    ),
  },
];

export default function Tour() {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);

  const done = useCallback(() => {
    try { localStorage.setItem(KEY, "done"); } catch { /* private mode: the tour just shows again next time */ }
    ref.current?.close();
  }, []);
  const open = useCallback(() => { setI(0); setDir(1); if (!ref.current?.open) ref.current?.showModal(); }, []);

  // The game, shared calls and the first-stock guide explain themselves, so the tour stays out of them.
  const path = usePathname() ?? "";
  const quiet = path.startsWith("/app/call") || path.startsWith("/app/start") || path === "/c";
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(KEY) === "done"; } catch { seen = true; }
    const t = seen || quiet ? undefined : setTimeout(open, 700);
    window.addEventListener("rh:tour", open);
    return () => { if (t) clearTimeout(t); window.removeEventListener("rh:tour", open); };
  }, [open, quiet]);

  const go = (n: number) => { if (n < 0 || n >= STEPS.length) return; setDir(n > i ? 1 : -1); setI(n); };
  const last = i === STEPS.length - 1;
  const s = STEPS[i];

  return (
    <dialog ref={ref} aria-labelledby="tour-title" onCancel={done}
      onKeyDown={(e) => { if (e.key === "ArrowRight") go(i + 1); if (e.key === "ArrowLeft") go(i - 1); }}
      className="tour m-0 mt-auto w-full max-w-none rounded-t-3xl bg-bg p-0 text-ink shadow-card sm:m-auto sm:max-w-[440px] sm:rounded-3xl">
      <div className="flex items-center justify-between px-6 pt-5">
        <span className="num text-[12.5px] text-muted">{i + 1} of {STEPS.length}</span>
        <button onClick={done} className="rounded-md px-2 py-1 text-[13.5px] font-medium text-muted hover:text-ink">Skip</button>
      </div>

      <div key={i} className={cx("tour-step px-6 pb-2 pt-4", dir === 1 ? "tour-next" : "tour-prev")}>
        <div className="rounded-2xl bg-surface p-6">{s.visual}</div>
        <h2 id="tour-title" className="mt-6 text-[22px] font-semibold leading-tight">{s.title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
      </div>

      <div className="flex items-center gap-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
        <div className="flex gap-1.5" role="tablist" aria-label="Tour steps">
          {STEPS.map((_, n) => (
            <button key={n} role="tab" aria-selected={n === i} aria-label={`Step ${n + 1}`} onClick={() => go(n)}
              className={cx("h-1.5 rounded-full transition-[width,background-color] duration-200", n === i ? "w-6 bg-ink" : "w-1.5 bg-line-strong hover:bg-muted")} />
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {i > 0 && <button onClick={() => go(i - 1)} className="h-10 rounded-lg px-4 text-[14px] font-medium text-ink-2 hover:bg-surface-2">Back</button>}
          <button autoFocus onClick={() => (last ? (done(), router.push("/app?t=NVDAx")) : go(i + 1))}
            className="h-10 rounded-lg bg-brand px-5 text-[14px] font-medium text-on-brand transition-colors hover:bg-brand-hover">
            {last ? "Check Nvidia" : "Next"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
