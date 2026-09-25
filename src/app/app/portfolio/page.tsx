"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { pct, price, usd } from "@/lib/format";
import { Button, cx, InfoTip, Notice, PageHeader, Pill, Skeleton, TokenIcon, toneText } from "@/components/ui";

type Holding = { symbol: string; name: string; kind: string; mint: string; icon?: string; shares: number; fairPrice: number | null; fairSource: string | null; fairValue: number | null; exitValue: number | null; exitGapPct: number | null; transferFeeBps: number; multiplier: number };
type Data = { holdings: Holding[]; totals: { fair: number; exit: number; stuck: number } };

export default function Portfolio() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [addr, setAddr] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mine = publicKey?.toBase58() ?? "";
  const target = addr.trim() || mine;

  async function check(a = target) {
    if (!a) return;
    setLoading(true); setErr(null);
    const j = await fetch(`/api/wallet?address=${a}`).then((r) => r.json()).catch(() => ({ error: "Can't reach the server." }));
    if (j.error) { setErr(/invalid|base58|public key/i.test(j.error) ? "That isn't a valid Solana address." : j.error); setData(null); } else setData(j);
    setLoading(false);
  }

  // Load the connected wallet straight away.
  useEffect(() => {
    if (!mine) return;
    const t = setTimeout(() => { void check(mine); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine]);

  const gap = data && data.totals.fair ? (1 - data.totals.exit / (data.totals.fair - data.totals.stuck || 1)) * 100 : null;

  return (
    <div className="space-y-8">
      <PageHeader title="Portfolio" />

      <form onSubmit={(e) => { e.preventDefault(); check(); }} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="addr" className="sr-only">Wallet address</label>
        <input id="addr" value={addr} onChange={(e) => setAddr(e.target.value)} spellCheck={false}
          placeholder={mine ? `${mine.slice(0, 4)}…${mine.slice(-4)} (connected)` : "Solana wallet address"}
          className="num h-10 w-full rounded-lg border border-line bg-bg px-3.5 text-[14px] outline-none transition-colors placeholder:text-muted focus:border-ink" />
        <Button type="submit" loading={loading} disabled={!target} className="shrink-0">Check</Button>
        {!publicKey && <Button type="button" variant="secondary" className="shrink-0" onClick={() => setVisible(true)}>Connect wallet</Button>}
      </form>

      {err && <Notice tone="bad">{err}</Notice>}

      {!data && !loading && !err && (
        <div className="rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
          <p className="text-[15px] font-medium">No wallet selected</p>
          <p className="mt-1 text-[14px] text-muted">Connect yours or paste an address to see what your holdings would sell for.</p>
        </div>
      )}

      {loading && !data && (
        <div className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {data && data.holdings.length === 0 && (
        <div className="rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
          <p className="text-[15px] font-medium">No tokenized stocks here</p>
          <p className="mt-1 text-[14px] text-muted"><Link href="/app" className="font-medium text-brand-ink hover:underline">Buy your first stock</Link></p>
        </div>
      )}

      {data && data.holdings.length > 0 && (
        <>
          <dl className="grid gap-6 border-b border-line pb-6 sm:grid-cols-3">
            <Total k="Value" tip="Each holding at the real stock price, or the latest valuation for pre-IPO tokens." v={usd(data.totals.fair, 0)} />
            <Total k="If sold now" tip="Live on-chain sale quotes, after token fees." v={usd(data.totals.exit, 0)} sub={gap != null && gap > 0 ? `${gap.toFixed(1)}% below value` : undefined} />
            <Total k="Can't sell at once" v={usd(data.totals.stuck, 0)} tone={data.totals.stuck > 0 ? "text-bad" : undefined} sub={data.totals.stuck > 0 ? "Not enough buyers on-chain" : undefined} />
          </dl>

          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[600px] text-[14px]">
              <thead className="border-b border-line text-left text-[12.5px] text-muted">
                <tr>
                  <th scope="col" className="py-2.5 pr-3 font-medium">Holding</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Value</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">If sold now</th>
                  <th scope="col" className="py-2.5 pl-3 text-right font-medium">Difference</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.map((h) => {
                  const g = h.exitGapPct;
                  const tone = g == null ? "neutral" : g > 5 ? "bad" : g > 1 ? "warn" : "good";
                  return (
                    <tr key={h.mint} className="border-b border-line">
                      <td className="py-2.5 pr-3">
                        <Link href={`/app?t=${h.symbol}`} className="flex items-center gap-3">
                          <TokenIcon src={h.icon} symbol={h.symbol} size={28} />
                          <span>
                            <span className="block font-medium">{h.name}</span>
                            <span className="num block text-[12px] text-muted">{h.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })} {h.symbol}{h.fairPrice ? ` · ${price(h.fairPrice)}` : ""}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="num px-3 py-2.5 text-right">{h.fairValue != null ? usd(h.fairValue) : "–"}</td>
                      <td className="num px-3 py-2.5 text-right">{h.exitValue != null ? usd(h.exitValue) : <Pill tone="bad">No buyer</Pill>}</td>
                      <td className={cx("num py-2.5 pl-3 text-right font-medium", toneText[tone])}>{g == null ? "–" : pct(-g)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Total({ k, v, sub, tip, tone }: { k: string; v: string; sub?: string; tip?: string; tone?: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[12.5px] text-muted">{k}{tip && <InfoTip label={`About ${k.toLowerCase()}`}>{tip}</InfoTip>}</dt>
      <dd className={cx("num mt-1 text-[24px] font-semibold", tone)}>{v}</dd>
      {sub && <dd className="text-[12.5px] text-muted">{sub}</dd>}
    </div>
  );
}
