"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { Button, PageHeader, Pill, TokenIcon, cx } from "@/components/ui";
import { useAssets } from "@/lib/hooks";
import { shortAddr, usd } from "@/lib/format";
import { load } from "@/lib/call";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const MIN_SOL = 0.005; // enough for a handful of trades and a new token account
const FIRST: [string, string][] = [["NVDAx", "Nvidia"], ["TSLAx", "Tesla"], ["AAPLx", "Apple"], ["SPYx", "S&P 500"]];

type Balances = { sol: number; usdc: number; stocks: number };

// Live balances for the connected wallet: SOL for fees, USDC to spend, and any stock tokens held.
function useBalances(stockMints: string[]) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [b, setB] = useState<Balances | null>(null);
  const key = publicKey?.toBase58();
  const mints = stockMints.join(",");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const owner = new PublicKey(key);
    const run = async () => {
      try {
        const [lamports, classic, t22] = await Promise.all([
          connection.getBalance(owner),
          connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN }),
          connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022 }),
        ]);
        const amt = (a: { account: { data: unknown } }) => (a.account.data as { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null } } } }).parsed.info;
        const usdc = classic.value.map(amt).filter((i) => i.mint === USDC).reduce((s, i) => s + (i.tokenAmount.uiAmount ?? 0), 0);
        const set = new Set(mints.split(","));
        const stocks = t22.value.map(amt).filter((i) => set.has(i.mint) && (i.tokenAmount.uiAmount ?? 0) > 0).length;
        if (alive) setB({ sol: lamports / 1e9, usdc, stocks });
      } catch { /* RPC busy: keep the last reading */ }
    };
    run();
    const t = setInterval(run, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, [connection, key, mints]);
  return key ? b : null;
}

export default function Start() {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { data: assets } = useAssets();
  const stocks = (assets ?? []).filter((a) => a.kind === "xstock");
  const bal = useBalances(stocks.map((a) => a.mint));
  const [env, setEnv] = useState<{ mobile: boolean; inWallet: boolean; url: string; played: boolean }>({ mobile: false, inWallet: false, url: "", played: false });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const w = window as unknown as { phantom?: unknown; solflare?: unknown; solana?: unknown };
    const t = setTimeout(() => setEnv({
      mobile: /iPhone|iPad|Android/i.test(navigator.userAgent),
      inWallet: !!(w.phantom || w.solflare || w.solana),
      url: window.location.href,
      played: load().practiceBest > 0 || load().calls.length > 0,
    }), 0);
    return () => clearTimeout(t);
  }, []);

  const funded = !!bal && bal.usdc >= 1 && bal.sol >= MIN_SOL;
  const owns = !!bal && bal.stocks > 0;
  const addr = publicKey?.toBase58() ?? "";
  const ref = encodeURIComponent(env.url ? new URL(env.url).origin : "");
  const copy = async () => { try { await navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ } };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title="Your first stock" sub="Own a slice of Nvidia, Tesla or Apple from $10. Four steps, about five minutes." />

      <ol className="space-y-3">
        <Step n={1} done={env.played} title="Try it free" optional>
          <p>See how weekend prices predict Monday&apos;s open. No money, no sign-up.</p>
          <Link href="/app/call" className="mt-3 inline-flex font-medium text-brand-ink hover:underline">Play Monday Call</Link>
        </Step>

        <Step n={2} done={connected} title={connected ? `Wallet connected · ${shortAddr(addr)}` : "Get a wallet"}>
          {connected ? <p>This is your own account on Solana. Only you can move what&apos;s in it.</p> : (
            <>
              <p>A wallet is your own account on Solana. It&apos;s free, and only you can move what&apos;s in it. Phantom and Solflare are the most popular.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {env.mobile && !env.inWallet ? (
                  <>
                    <a className={linkBtn(true)} href={`https://phantom.app/ul/browse/${encodeURIComponent(env.url)}?ref=${ref}`}>Open in Phantom</a>
                    <a className={linkBtn(false)} href={`https://solflare.com/ul/v1/browse/${encodeURIComponent(env.url)}?ref=${ref}`}>Open in Solflare</a>
                  </>
                ) : (
                  <>
                    <Button onClick={() => setVisible(true)}>Connect wallet</Button>
                    {!env.inWallet && <a className={linkBtn(false)} href="https://phantom.com/download" target="_blank" rel="noreferrer">Get Phantom</a>}
                  </>
                )}
              </div>
              {env.mobile && !env.inWallet && <p className="mt-2 text-[12.5px] text-muted">Don&apos;t have one yet? The button installs it, then opens this page inside it.</p>}
            </>
          )}
        </Step>

        <Step n={3} done={funded} title="Add dollars" locked={!connected}>
          <p>Stocks here are bought with USDC, a digital dollar worth $1. You also need a little SOL, about $1, to pay network fees.</p>
          {connected && bal && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone={bal.usdc >= 1 ? "good" : "neutral"}>{usd(bal.usdc)} USDC</Pill>
              <Pill tone={bal.sol >= MIN_SOL ? "good" : "warn"}>{bal.sol.toFixed(3)} SOL{bal.sol < MIN_SOL ? " · need about 0.01" : ""}</Pill>
            </div>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-surface px-3.5 py-3">
              <p className="font-medium text-ink">With a card</p>
              <p className="mt-0.5">In your wallet, tap <b className="font-medium text-ink">Buy</b>, pick USDC, then a little SOL. Card and Apple Pay depend on your country.</p>
            </div>
            <div className="rounded-lg bg-surface px-3.5 py-3">
              <p className="font-medium text-ink">From an exchange</p>
              <p className="mt-0.5">Withdraw USDC and a little SOL to your address below. Choose the <b className="font-medium text-ink">Solana</b> network, or the money can be lost.</p>
            </div>
          </div>
          {connected && (
            <button onClick={copy} className="num mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-bg px-3.5 py-2.5 text-left text-[13px] text-ink hover:border-line-strong">
              <span className="truncate">{addr}</span>
              <span className="shrink-0 font-medium text-brand-ink">{copied ? "Copied" : "Copy"}</span>
            </button>
          )}
        </Step>

        <Step n={4} done={owns} title={owns ? "You own a stock" : "Buy your first stock"} locked={!connected}>
          <p>Pick one. You&apos;ll see the real price and exactly what you pay before you confirm, and protection cancels the trade if the fill is worse than your limit.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FIRST.map(([s, label]) => {
              const a = stocks.find((x) => x.symbol === s);
              return (
                <Link key={s} href={`/app?t=${s}&usd=10`} className="flex items-center gap-2.5 rounded-xl border border-line bg-panel px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface">
                  <TokenIcon src={a?.icon} symbol={s} size={26} />
                  <span className="min-w-0"><span className="block truncate text-[13.5px] font-medium text-ink">{label}</span><span className="block text-[12px]">$10</span></span>
                </Link>
              );
            })}
          </div>
          {owns && <Link href="/app/portfolio" className="mt-3 inline-flex font-medium text-brand-ink hover:underline">See your portfolio</Link>}
        </Step>
      </ol>

      <section aria-labelledby="what-h" className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <h2 id="what-h" className="text-[17px] font-semibold">What you&apos;re buying</h2>
        <dl className="mt-3 grid gap-4 text-[14px] sm:grid-cols-2">
          <Fact k="A token backed by a real share">Each xStock is backed 1:1 by the real share, held by the issuer, Backed. Its price follows the stock.</Fact>
          <Fact k="Yours, in your wallet">No broker holds it for you. You can sell it back to dollars any time, day or night.</Fact>
          <Fact k="Trades when Wall Street is shut">Tokens trade all weekend, so their price can drift from the real stock. Rehearsal shows you that gap before you buy.</Fact>
          <Fact k="Who can buy">xStocks aren&apos;t offered to people in the US and some other countries. Check the issuer&apos;s terms for yours.</Fact>
        </dl>
        <p className="mt-4 text-[12.5px] text-muted">Not investment advice. Stock prices go down as well as up.</p>
      </section>
    </div>
  );
}

const linkBtn = (primary: boolean) => cx("inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-medium transition-colors",
  primary ? "bg-brand text-on-brand hover:bg-brand-hover" : "border border-line bg-panel text-ink hover:border-line-strong hover:bg-surface");

function Step({ n, title, done, locked, optional, children }: { n: number; title: string; done: boolean; locked?: boolean; optional?: boolean; children: ReactNode }) {
  return (
    <li className={cx("card-in flex gap-4 rounded-2xl border bg-panel p-4 sm:p-5", done ? "border-line" : "border-line-strong", locked && "opacity-60")}>
      <span aria-hidden="true" className={cx("num grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-semibold", done ? "bg-good-soft text-good" : "bg-surface-2 text-ink")}>
        {done ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m4 8.5 2.5 2.5 5.5-6" /></svg> : n}
      </span>
      <div className="min-w-0 flex-1 text-[14px] leading-relaxed text-muted">
        <h2 className="flex flex-wrap items-center gap-2 text-[16px] font-semibold leading-8 text-ink">
          {title}
          {done && <span className="sr-only">(done)</span>}
          {optional && !done && <span className="text-[12px] font-normal text-muted">Optional</span>}
        </h2>
        {children}
      </div>
    </li>
  );
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-ink">{k}</dt>
      <dd className="mt-0.5 leading-relaxed text-muted">{children}</dd>
    </div>
  );
}
