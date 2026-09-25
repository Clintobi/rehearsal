"use client";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { pct, price, usd } from "@/lib/format";
import { Button, cx, InfoTip, Pill, Skeleton, TokenIcon, toneText } from "@/components/ui";

type Holding = { symbol: string; name: string; kind: string; mint: string; icon?: string; shares: number; fairPrice: number | null; fairSource: string | null; fairValue: number | null; exitValue: number | null; exitGapPct: number | null; transferFeeBps: number; multiplier: number };
type Data = { holdings: Holding[]; totals: { fair: number; exit: number; stuck: number } };

export default function Portfolio() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [addr, setAddr] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const target = addr.trim() || publicKey?.toBase58() || "";

  async function check(a = target) {
    if (!a) return;
    setLoading(true); setErr(null);
    const j = await fetch(`/api/wallet?address=${a}`).then((r) => r.json()).catch(() => ({ error: "Couldn't reach the server." }));
    if (j.error) { setErr(j.error); setData(null); } else setData(j);
    setLoading(false);
  }

  const gap = data && data.totals.fair ? (1 - data.totals.exit / (data.totals.fair - data.totals.stuck || 1)) * 100 : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight">Portfolio</h1>
        <p className="mt-1 text-[15px] text-muted">What your tokenized stocks would really pay out if you sold today.</p>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); check(); }} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="addr" className="sr-only">Wallet address</label>
        <input id="addr" value={addr} onChange={(e) => setAddr(e.target.value)} spellCheck={false}
          placeholder={publicKey ? `Your wallet ${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}` : "Paste any Solana wallet address"}
          className="num h-12 w-full rounded-full border border-line bg-panel px-5 text-[14px] outline-none placeholder:text-muted focus:border-brand" />
        <Button size="lg" type="submit" loading={loading} disabled={!target} className="shrink-0">Check wallet</Button>
        {!publicKey && <Button size="lg" type="button" variant="secondary" className="shrink-0" onClick={() => setVisible(true)}>Connect</Button>}
      </form>

      {err && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-[14px] text-bad">{err}</p>}

      {!data && !loading && !err && (
        <div className="rounded-[10px] border border-dashed border-line-strong px-6 py-12 text-center">
          <p className="text-[16px] font-semibold">Check any wallet</p>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-muted">Connect yours or paste an address. Large pre-IPO positions often can&apos;t be sold on-chain in one go, and this shows you before you need to.</p>
        </div>
      )}

      {loading && !data && (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {data && data.holdings.length === 0 && (
        <p className="rounded-[10px] border border-line bg-panel px-6 py-10 text-center text-[15px] text-muted">No xStocks or PreStocks in this wallet.</p>
      )}

      {data && data.holdings.length > 0 && (
        <>
          <dl className="grid gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-3">
            <div className="bg-panel p-5">
              <dt className="flex items-center gap-1 text-[13px] text-muted">Worth<InfoTip>Each holding at the real stock price, or PreStocks&apos; valuation for pre-IPO tokens.</InfoTip></dt>
              <dd className="num mt-1 text-[26px] font-semibold tracking-tight">{usd(data.totals.fair, 0)}</dd>
            </div>
            <div className="bg-panel p-5">
              <dt className="text-[13px] text-muted">Sell everything now</dt>
              <dd className="num mt-1 text-[26px] font-semibold tracking-tight">{usd(data.totals.exit, 0)}</dd>
              {gap != null && <dd className="mt-0.5 text-[13px] text-muted">{gap > 0 ? `${gap.toFixed(1)}% less than it's worth` : "At or above what it's worth"}</dd>}
            </div>
            <div className="bg-panel p-5">
              <dt className="text-[13px] text-muted">Can&apos;t be sold at once</dt>
              <dd className={cx("num mt-1 text-[26px] font-semibold tracking-tight", data.totals.stuck > 0 && "text-bad")}>{usd(data.totals.stuck, 0)}</dd>
              {data.totals.stuck > 0 && <dd className="mt-0.5 text-[13px] text-muted">Not enough on-chain buyers for the full size</dd>}
            </div>
          </dl>

          <div className="overflow-x-auto rounded-[10px] border border-line bg-panel">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead className="border-b border-line text-left text-[13px] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Holding</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Worth</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Sell now</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Difference</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.map((h) => {
                  const g = h.exitGapPct;
                  const tone = g == null ? "neutral" : g > 5 ? "bad" : g > 1 ? "warn" : "good";
                  return (
                    <tr key={h.mint} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <TokenIcon src={h.icon} symbol={h.symbol} size={30} />
                          <span>
                            <span className="block font-semibold">{h.name}</span>
                            <span className="num block text-[12px] text-muted">{h.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })} {h.symbol}{h.fairPrice ? ` · ${price(h.fairPrice)}` : ""}</span>
                          </span>
                        </span>
                      </td>
                      <td className="num px-4 py-3 text-right">{h.fairValue != null ? usd(h.fairValue) : "–"}</td>
                      <td className="num px-4 py-3 text-right">{h.exitValue != null ? usd(h.exitValue) : <Pill tone="bad">No buyer at this size</Pill>}</td>
                      <td className={cx("num px-4 py-3 text-right font-semibold", toneText[tone])}>{g == null ? "–" : pct(-g)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] text-muted">Sale values are live Jupiter quotes after token fees. Pre-IPO tokens are compared with PreStocks&apos; valuation, which is an estimate.</p>
        </>
      )}
    </div>
  );
}
