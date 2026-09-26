"use client";
import { useState } from "react";
import { cx } from "@/components/ui";

// Share a call or a score. Groups live on Telegram and WhatsApp, so both sit next to X.
export function ShareRow({ query, text, className }: { query: string; text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const url = () => `${window.location.origin}/c?${query}`;
  const open = (href: string) => window.open(href, "_blank", "noopener,noreferrer");
  const native = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: "Monday Call", text, url: url() }); return; }
    } catch { return; /* cancelled */ }
    copy();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${text} ${url()}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-[13px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface";
  return (
    <div className={cx("flex flex-wrap items-center gap-2", className)}>
      <button className={btn} onClick={native}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
        Share
      </button>
      <button className={btn} onClick={() => open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url())}`)}>X</button>
      <button className={btn} onClick={() => open(`https://t.me/share/url?url=${encodeURIComponent(url())}&text=${encodeURIComponent(text)}`)}>Telegram</button>
      <button className={btn} onClick={() => open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url()}`)}`)}>WhatsApp</button>
      <button className={btn} onClick={copy} aria-live="polite">{copied ? "Copied" : "Copy link"}</button>
    </div>
  );
}
