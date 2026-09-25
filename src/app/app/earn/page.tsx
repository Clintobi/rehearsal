"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import { Button, cx, InfoTip, Pill, Segmented, Skeleton, TokenIcon } from "@/components/ui";
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
      setNote({ tone: "good", text: `Done. Transaction ${s.signature.slice(0, 8)}…` });
      reload();
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : String(e) });
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
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Earn</h1>
          <p className="mt-1 max-w-[62ch] text-[15px] text-muted">Get paid to buy a stock lower or sell it higher. Every position settles at Friday&apos;s 4:00 PM close.</p>
        </div>
        {data && (live ? <Pill tone={data.practice ? "warn" : "good"}>{data.practice ? "Practice network" : "Live"}</Pill> : <Pill tone="neutral">In testing</Pill>)}
      </header>

      {data && !live && (
        <p className="rounded-[10px] border border-line bg-panel px-5 py-4 text-[14px] text-ink-2">
          Earn isn&apos;t on mainnet yet. It runs on the practice network until its audit is done.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
        <section aria-label="Set aside and earn" className="h-fit rounded-[10px] border border-line bg-panel p-5 sm:p-6">
          <div className="grid grid-cols-3 gap-2">
            {(data?.stocks ?? []).map((s) => (
              <button key={s.symbol} onClick={() => setSymbol(s.symbol)} aria-pressed={symbol === s.symbol}
                className={cx("flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors", symbol === s.symbol ? "border-ink bg-surface" : "border-line hover:border-line-strong")}>
                <TokenIcon src={s.icon} symbol={s.symbol} size={24} />
                <span className="min-w-0"><span className="block truncate text-[13px] font-semibold">{s.ticker}</span><span className="num block text-[12px] text-muted">{money(s.share)}</span></span>
              </button>
            ))}
            {!data && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[52px] rounded-lg" />)}
          </div>

          <div className="mt-5 space-y-5">
            <Segmented label="Goal" value={mode} onChange={setMode} options={[{ value: "put", label: "Buy lower" }, { value: "call", label: "Sell higher" }]} />

            <div>
              <span className="text-[13px] font-medium text-muted">{mode === "put" ? "Price you'd buy at" : "Price you'd sell at"}</span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {strikes.map((v) => (
                  <button key={v} onClick={() => setStrikePick({ key: sk, v })}
                    className={cx("num flex h-12 flex-col items-center justify-center rounded-lg border text-[14px] font-semibold transition-colors", k === v ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-line-strong")}>
                    {money(v, v % 1 ? 2 : 0)}
                    <span className={cx("text-[11px] font-medium", k === v ? "text-bg/70" : "text-muted")}>{stock ? `${((v / stock.share - 1) * 100).toFixed(1)}%` : ""}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-[13px] font-medium text-muted">{mode === "put" ? "USDC to set aside" : `${symbol} to set aside`}</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={mode === "put" ? "500" : "1"}
                className="num mt-2 h-12 w-full rounded-lg border border-line bg-bg px-4 text-[16px] font-semibold outline-none focus:border-ink" />
            </label>

            <label className="block">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
                Your price per share
                <InfoTip label="About the price">What a buyer pays you per share. The starting value is an estimate from the stock&apos;s typical swings. You earn it only if someone buys.</InfoTip>
              </span>
              <input inputMode="decimal" value={ask} onChange={(e) => setAskEdit({ key: ak, v: e.target.value.replace(/[^0-9.]/g, "") })}
                className="num mt-2 h-12 w-full rounded-lg border border-line bg-bg px-4 text-[16px] font-semibold outline-none focus:border-ink" />
            </label>

            {k && stock && (
              <div className="space-y-2 rounded-lg bg-surface px-4 py-3 text-[14px]">
                <p className="flex justify-between gap-3"><span className="text-muted">If it sells, you earn</span><span className="num font-semibold">{shares ? money(premium) : "Enter an amount"}{pct > 0 && <span className="text-muted"> · {(pct * 100).toFixed(2)}% in {Math.round(days)} days</span>}</span></p>
                {mode === "put" ? (
                  <>
                    <p className="text-ink-2">Closes above {money(k, 2)} on {data && friday(data.expiry)}: you keep your {amt ? money(amt, 0) : "USDC"}.</p>
                    <p className="text-ink-2">Closes below: you pay the difference, as if you&apos;d bought at {money(k, 2)}.</p>
                  </>
                ) : (
                  <>
                    <p className="text-ink-2">Closes below {money(k, 2)} on {data && friday(data.expiry)}: you keep your {stock.ticker}.</p>
                    <p className="text-ink-2">Closes above: you give up the gain past {money(k, 2)}, paid out in {stock.symbol}.</p>
                  </>
                )}
              </div>
            )}

            <Button size="lg" className="w-full" loading={busy === "write"} disabled={!!publicKey && (!actionable || !shares || !askN)}
              onClick={publicKey ? write : () => setVisible(true)}>
              {!publicKey ? "Connect wallet" : mode === "put" ? `Set aside ${amt ? money(amt, 0) : "USDC"}` : `Set aside ${amt ? qty(amt) : ""} ${stock?.ticker ?? ""}`}
            </Button>
            {note && <p role="status" className={cx("text-[13px]", note.tone === "good" ? "text-good" : "text-bad")}>{note.text}</p>}
            <p className="text-[12.5px] text-muted">Writing closes 15 minutes before Friday&apos;s close. Unsold amounts can be taken back until then.</p>
          </div>
        </section>

        <div className="space-y-10">
          <section aria-labelledby="open-h">
            <h2 id="open-h" className="text-[18px] font-semibold">Open for {data ? friday(data.expiry) : "Friday"}</h2>
            <p className="mt-1 text-[14px] text-muted">What writers are asking. Buyers get the drop or the rise past each price at Friday&apos;s close.</p>
            <div className="mt-4 overflow-hidden rounded-[10px] border border-line">
              {error && <p className="px-5 py-4 text-[14px] text-bad">{error}</p>}
              {!error && open.length === 0 && <p className="px-5 py-6 text-[14px] text-muted">{live ? "Nothing open yet." : "Opens when Earn goes live."}</p>}
              {open.map((s) => {
                const st = data!.stocks.find((x) => x.symbol === s.symbol)!;
                const avail = s.asks.reduce((n, a) => n + Number(a.available), 0) / TOKEN * st.multiplier;
                const best = Number(s.bestAskE6) / 1e6 / st.multiplier;
                return (
                  <div key={s.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3.5 last:border-0">
                    <TokenIcon src={st.icon} symbol={st.symbol} size={28} />
                    <span className="min-w-[9rem] text-[14px]"><span className="font-semibold">{st.ticker} {s.kind === "put" ? "below" : "above"} {money(s.shareStrike)}</span><span className="block text-[12px] text-muted">{s.kind === "put" ? "Pays the drop" : "Pays the rise"}</span></span>
                    <span className="num text-[14px] text-ink-2">{qty(avail)} shares</span>
                    <span className="num text-[14px] font-semibold">{money(best)}<span className="font-normal text-muted"> /share</span></span>
                    <Button size="sm" variant="secondary" className="ml-auto" loading={busy === s.key} disabled={!actionable}
                      onClick={() => sign({ action: "buy", series: s.key, contracts: s.asks[0].available, maxAskE6: s.asks[0].askE6 }, s.key)}>
                      Buy {qty(Number(s.asks[0].available) / TOKEN * st.multiplier)}
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="mine-h">
            <h2 id="mine-h" className="text-[18px] font-semibold">Yours</h2>
            <div className="mt-4 overflow-hidden rounded-[10px] border border-line">
              {!publicKey && <p className="px-5 py-6 text-[14px] text-muted">Connect a wallet to see your positions.</p>}
              {publicKey && mine.length === 0 && <p className="px-5 py-6 text-[14px] text-muted">No positions yet.</p>}
              {mine.map((p) => {
                const st = data!.stocks.find((x) => x.symbol === p.s.symbol)!;
                const sh = (n: number) => qty((n / TOKEN) * st.multiplier);
                const past = data!.now >= p.s.expiry;
                const claimable = p.s.settled || data!.now >= p.s.expiry + 15 * 60;
                const status = p.s.settled
                  ? `Settled at ${money(Number(p.s.settlePriceE6) / 1e6 / st.multiplier)}${p.s.stale ? " (last price before a halt)" : ""}`
                  : past ? "Waiting for the closing price" : `Settles ${friday(p.s.expiry)}, 4:00 PM`;
                return (
                  <div key={`${p.role}-${p.s.key}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3.5 last:border-0">
                    <TokenIcon src={st.icon} symbol={st.symbol} size={28} />
                    <span className="min-w-[10rem] text-[14px]">
                      <span className="font-semibold">{p.role === "writer" ? (p.s.kind === "put" ? "Buy lower" : "Sell higher") : (p.s.kind === "put" ? "Paid if below" : "Paid if above")} {money(p.s.shareStrike)}</span>
                      <span className="block text-[12px] text-muted">{status}</span>
                    </span>
                    <span className="num text-[14px] text-ink-2">
                      {p.role === "writer" ? `${sh(p.sold)} of ${sh(p.contracts)} sold` : `${sh(p.contracts)} shares`}
                    </span>
                    <span className="ml-auto flex gap-2">
                      {p.role === "writer" && !past && p.contracts > p.sold && (
                        <Button size="sm" variant="ghost" loading={busy === `u-${p.s.key}`} disabled={!actionable}
                          onClick={() => sign({ action: "unwrite", series: p.s.key, contracts: String(p.contracts - p.sold) }, `u-${p.s.key}`)}>Take back unsold</Button>
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
