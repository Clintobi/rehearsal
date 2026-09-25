"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import { Button, cx, InfoTip, Notice, PageHeader, Pill, Segmented, Skeleton, TokenIcon } from "@/components/ui";
import type { EarnBoard, SeriesOut } from "@/lib/earn-server";

type Mode = "put" | "call";
const TOKEN = 1e8; // raw units per whole xStock
const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const bytesToB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const money = (n: number, d = 2) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });
const friday = (unix: number) => new Date(unix * 1000).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "America/New_York" });

function useEarn(wallet?: string) {
  const [data, setData] = useState<(EarnBoard & { practice?: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(`/api/earn${wallet ? `?wallet=${wallet}` : ""}`).then((r) => r.json()).then((d) => (d.error ? setError(d.error) : (setData(d), setError(null)))).catch(() => setError("Couldn't load Earn right now."));
  }, [wallet]);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);
  return { data, error, reload: load };
}

export default function Earn() {
  const { publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const { data, error, reload } = useEarn(publicKey?.toBase58());
  const [symbol, setSymbol] = useState("NVDAx");
  const [mode, setMode] = useState<Mode>("put");
  // Picks and edits are keyed to what they were made for, so switching stock or goal resets them.
  const [strikePick, setStrikePick] = useState<{ key: string; v: number } | null>(null);
  const [amount, setAmount] = useState("");
  const [askEdit, setAskEdit] = useState<{ key: string; v: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const stock = data?.stocks.find((s) => s.symbol === symbol);
  const strikes = stock ? stock.strikes[mode] : [];
  const sk = `${symbol}-${mode}`;
  const k = (strikePick?.key === sk ? strikePick.v : null) ?? strikes[0] ?? null;
  const suggestion = stock?.suggest.find((s) => s.kind === mode && s.shareStrike === k)?.askPerShare;
  const ak = `${sk}-${k}`;
  const ask = askEdit?.key === ak ? askEdit.v : suggestion !== undefined ? suggestion.toFixed(2) : "";

  const days = data ? Math.max((data.expiry - data.now) / 86400, 1 / 24) : 7;
  const amt = Number(amount) || 0;
  const askN = Number(ask) || 0;
  // Shares covered: USDC / strike for "buy lower", tokens for "sell higher".
  const shares = k ? (mode === "put" ? amt / k : amt) : 0;
  const premium = shares * askN;
  const pct = k && askN ? askN / k : 0; // for the week, not annualized: a weekly premium times 52 overstates it

  async function sign(body: object, label: string) {
    if (!publicKey || !signTransaction) { setVisible(true); return; }
    setBusy(label); setNote(null);
    try {
      const b = await fetch("/api/earn/tx", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, wallet: publicKey.toBase58() }) }).then((r) => r.json());
      if (b.error) throw new Error(b.error);
      const signed = await signTransaction(VersionedTransaction.deserialize(b64ToBytes(b.transaction)));
      const s = await fetch("/api/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signed: bytesToB64(signed.serialize()), lastValidBlockHeight: b.lastValidBlockHeight }) }).then((r) => r.json());
      if (s.error) throw new Error(s.error);
      setNote({ tone: "good", text: "Done." });
      reload();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setNote({ tone: "bad", text: /User rejected|rejected the request/i.test(m) ? "You cancelled in your wallet. Nothing was sent." : m });
    } finally {
      setBusy(null);
    }
  }

  function write() {
    if (!stock || !k || !shares) return;
    const m = stock.multiplier;
    const contracts = Math.floor((shares / m) * TOKEN);
    sign({
      action: "write", symbol, kind: mode, expiry: data!.expiry,
      strikeE6: String(Math.round(k * m * 1e6)), contracts: String(contracts), askE6: String(Math.round(askN * m * 1e6)),
    }, "write");
  }

  const open = useMemo(() => (data?.series ?? []).filter((s) => !s.settled && s.expiry === data?.expiry && s.bestAskE6), [data]);
  const mine = useMemo(() => {
    if (!data) return [];
    const by = new Map(data.series.map((s) => [s.key, s]));
    return [
      ...data.positions.map((p) => ({ role: "writer" as const, s: by.get(p.series), contracts: Number(p.contracts), sold: Number(p.sold), askE6: Number(p.askE6) })),
      ...data.holdings.map((h) => ({ role: "buyer" as const, s: by.get(h.series), contracts: Number(h.contracts), sold: 0, askE6: 0 })),
    ].filter((x): x is { role: "writer" | "buyer"; s: SeriesOut; contracts: number; sold: number; askE6: number } => !!x.s);
  }, [data]);

  const live = data?.live ?? false;
  const actionable = live && !busy;

  return (
    <div className="space-y-8">
      <PageHeader title="Earn" sub="Weekly premiums on NVDA, TSLA and SPY. Settles Fridays at 4:00 PM ET."
        right={data ? (live ? <Pill tone={data.practice ? "warn" : "good"}>{data.practice ? "Practice network" : "Live"}</Pill> : <Pill tone="neutral">In testing</Pill>) : undefined} />
      {data && !live && <Notice tone="neutral">Earn opens after its security audit. Prices shown are live.</Notice>}

      <div className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <aside className="lg:sticky lg:top-20 lg:order-2">
          <section aria-label="Earn a premium" className="rounded-xl border border-line bg-panel p-5">
            <div className="grid grid-cols-3 gap-1.5">
              {(data?.stocks ?? []).map((s) => (
                <button key={s.symbol} onClick={() => setSymbol(s.symbol)} aria-pressed={symbol === s.symbol}
                  className={cx("flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors", symbol === s.symbol ? "border-ink" : "border-line hover:border-line-strong")}>
                  <TokenIcon src={s.icon} symbol={s.symbol} size={20} />
                  <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{s.ticker}</span><span className="num block text-[11.5px] text-muted">{money(s.share)}</span></span>
                </button>
              ))}
              {!data && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[46px] rounded-lg" />)}
            </div>

            <div className="mt-4"><Segmented label="Goal" value={mode} onChange={setMode} options={[{ value: "put", label: "Buy lower" }, { value: "call", label: "Sell higher" }]} /></div>

            <p className="mt-5 text-[12.5px] text-muted">{mode === "put" ? "Buy at" : "Sell at"}</p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {strikes.map((v) => (
                <button key={v} onClick={() => setStrikePick({ key: sk, v })}
                  className={cx("num flex h-11 flex-col items-center justify-center rounded-md border text-[13.5px] font-medium transition-colors", k === v ? "border-ink bg-ink text-bg" : "border-line text-ink hover:border-line-strong")}>
                  {money(v, v % 1 ? 2 : 0)}
                  <span className={cx("text-[11px] font-normal", k === v ? "text-bg/70" : "text-muted")}>{stock ? `${((v / stock.share - 1) * 100).toFixed(1)}%` : ""}</span>
                </button>
              ))}
              {!stock && [0, 1, 2].map((i) => <Skeleton key={i} className="h-11 rounded-md" />)}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[12.5px] text-muted">{mode === "put" ? "USDC" : stock?.ticker ?? "Shares"}</span>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={mode === "put" ? "500" : "1"}
                  className="num mt-1.5 h-10 w-full rounded-lg border border-line bg-bg px-3 text-[15px] font-medium outline-none transition-colors placeholder:text-muted focus:border-ink" />
              </label>
              <label className="block">
                <span className="flex items-center gap-1 text-[12.5px] text-muted">Premium / share<InfoTip label="About the premium">What a buyer pays you per share. Starts at an estimate from the stock&apos;s usual swings.</InfoTip></span>
                <input inputMode="decimal" value={ask} onChange={(e) => setAskEdit({ key: ak, v: e.target.value.replace(/[^0-9.]/g, "") })}
                  className="num mt-1.5 h-10 w-full rounded-lg border border-line bg-bg px-3 text-[15px] font-medium outline-none transition-colors focus:border-ink" />
              </label>
            </div>

            {k && stock && (
              <dl className="mt-5 space-y-2 border-t border-line pt-4 text-[13.5px]">
                <div className="flex justify-between gap-3"><dt className="text-muted">You earn</dt><dd className="num font-medium">{shares ? money(premium) : "–"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Return</dt><dd className="num">{pct > 0 ? `${(pct * 100).toFixed(2)}% in ${Math.round(days)} days` : "–"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">{mode === "put" ? `Above ${money(k, 0)}` : `Below ${money(k, 0)}`}</dt><dd>Keep it all</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">{mode === "put" ? `Below ${money(k, 0)}` : `Above ${money(k, 0)}`}</dt><dd>{mode === "put" ? "You cover the drop" : "You give up the gain"}</dd></div>
              </dl>
            )}

            <Button size="lg" className="mt-5 w-full" loading={busy === "write"} disabled={!!publicKey && (!actionable || !shares || !askN)}
              onClick={publicKey ? write : () => setVisible(true)}>
              {!publicKey ? "Connect wallet" : !live ? "Opens after audit" : mode === "put" ? `Set aside ${amt ? money(amt, 0) : "USDC"}` : `Set aside ${amt ? qty(amt) : ""} ${stock?.ticker ?? ""}`}
            </Button>
            {note && <Notice tone={note.tone} className="mt-3">{note.text}</Notice>}
          </section>
        </aside>

        <div className="min-w-0 space-y-10 lg:order-1">
          <section aria-labelledby="open-h">
            <h2 id="open-h" className="text-[15px] font-semibold">For sale · {data ? friday(data.expiry) : "Friday"}</h2>
            <div className="mt-3 divide-y divide-line border-y border-line">
              {error && <div className="py-4"><Notice tone="bad">Earn is unavailable right now.</Notice></div>}
              {!data && !error && [0, 1, 2].map((i) => <div key={i} className="py-3"><Skeleton className="h-8 w-full" /></div>)}
              {data && !error && open.length === 0 && <p className="py-8 text-center text-[14px] text-muted">{live ? "Nothing for sale yet this week." : "Nothing for sale until Earn opens."}</p>}
              {open.map((s) => {
                const st = data!.stocks.find((x) => x.symbol === s.symbol)!;
                const avail = s.asks.reduce((n, a) => n + Number(a.available), 0) / TOKEN * st.multiplier;
                const best = Number(s.bestAskE6) / 1e6 / st.multiplier;
                return (
                  <div key={s.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <TokenIcon src={st.icon} symbol={st.symbol} size={28} />
                    <span className="min-w-[9rem] flex-1 text-[14px]"><span className="font-medium">{st.ticker} {s.kind === "put" ? "below" : "above"} {money(s.shareStrike)}</span><span className="num block text-[12px] text-muted">{qty(avail)} shares</span></span>
                    <span className="num text-[14px] font-medium">{money(best)}<span className="font-normal text-muted"> /share</span></span>
                    <Button size="sm" variant="secondary" loading={busy === s.key} disabled={!actionable}
                      onClick={() => sign({ action: "buy", series: s.key, contracts: s.asks[0].available, maxAskE6: s.asks[0].askE6 }, s.key)}>
                      Buy
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="mine-h">
            <h2 id="mine-h" className="text-[15px] font-semibold">Your positions</h2>
            <div className="mt-3 divide-y divide-line border-y border-line">
              {!publicKey && <p className="py-8 text-center text-[14px] text-muted">Connect a wallet to see your positions.</p>}
              {publicKey && mine.length === 0 && <p className="py-8 text-center text-[14px] text-muted">No positions yet.</p>}
              {mine.map((p) => {
                const st = data!.stocks.find((x) => x.symbol === p.s.symbol)!;
                const sh = (n: number) => qty((n / TOKEN) * st.multiplier);
                const past = data!.now >= p.s.expiry;
                const claimable = p.s.settled || data!.now >= p.s.expiry + 15 * 60;
                const status = p.s.settled
                  ? `Settled ${money(Number(p.s.settlePriceE6) / 1e6 / st.multiplier)}${p.s.stale ? " · halted close" : ""}`
                  : past ? "Settling" : `Settles ${friday(p.s.expiry)}`;
                return (
                  <div key={`${p.role}-${p.s.key}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <TokenIcon src={st.icon} symbol={st.symbol} size={28} />
                    <span className="min-w-[10rem] flex-1 text-[14px]">
                      <span className="font-medium">{p.role === "writer" ? (p.s.kind === "put" ? "Buy lower" : "Sell higher") : (p.s.kind === "put" ? "Paid below" : "Paid above")} {money(p.s.shareStrike)}</span>
                      <span className="block text-[12px] text-muted">{status}</span>
                    </span>
                    <span className="num text-[13.5px] text-muted">{p.role === "writer" ? `${sh(p.sold)} / ${sh(p.contracts)} sold` : `${sh(p.contracts)} shares`}</span>
                    <span className="flex gap-2">
                      {p.role === "writer" && !past && p.contracts > p.sold && (
                        <Button size="sm" variant="ghost" loading={busy === `u-${p.s.key}`} disabled={!actionable}
                          onClick={() => sign({ action: "unwrite", series: p.s.key, contracts: String(p.contracts - p.sold) }, `u-${p.s.key}`)}>Withdraw unsold</Button>
                      )}
                      {claimable && (
                        <Button size="sm" loading={busy === `c-${p.role}-${p.s.key}`} disabled={!actionable}
                          onClick={() => sign({ action: "claim", series: p.s.key, as: p.role }, `c-${p.role}-${p.s.key}`)}>Claim</Button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
