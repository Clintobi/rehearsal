"use client";
import { useState } from "react";
import { cx, Segmented } from "@/components/ui";

const MCP = "https://rehearsal-stocklana.vercel.app/api/mcp";
const TOOLS: [string, string][] = [
  ["passport", "What the token is, how good the price evidence is right now, how much you could sell at 1/2/5%, and a decision: proceed, reduce_size, wait or avoid."],
  ["build_protected_swap", "An unsigned transaction whose minimum output is fair value minus your limit. Past it, the whole trade reverts."],
  ["verify_receipt", "Re-reads a confirmed swap and checks what the wallet received against the floor written into it."],
  ["check_trade", "The price check alone, for fast loops."],
  ["market_status", "Sessions, halts, circuit breakers, 24/7 perp prices, and the opening and closing cross rules."],
  ["prestocks_research", "Pre-IPO tokens: implied valuation, premium to mark, break-even listing value, float."],
  ["agent_scorecard", "A wallet's sampled fills graded against fair value, with markouts."],
  ["execution_report", "How real fills compare with fair value, by token, session and size. Bots excluded."],
  ["price_policy", "Which price each trade is judged against, by market state."],
  ["list_stocks", "Everything covered, and its reference price."],
];

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }}
      className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink" aria-label={`Copy ${label}`}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Code({ children, label }: { children: string; label: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-surface px-4 py-3">
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre text-[13px] leading-relaxed text-ink"><code>{children}</code></pre>
      <Copy text={children} label={label} />
    </div>
  );
}

const CLIENTS = {
  claude: { label: "Claude Code", code: `claude mcp add --transport http rehearsal ${MCP}` },
  json: { label: "Cursor, Desktop", code: JSON.stringify({ mcpServers: { rehearsal: { url: MCP } } }, null, 2) },
  skill: { label: "Skill", code: "npx skills add Clintobi/rehearsal" },
  rest: { label: "REST", code: "curl 'https://rehearsal-stocklana.vercel.app/api/v1/passport?symbol=NVDAx&usd=1000'" },
};
type Client = keyof typeof CLIENTS;

export default function Agents() {
  const [client, setClient] = useState<Client>("claude");
  const [sym, setSym] = useState("NVDAx");
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const r = await fetch("/api/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "check_trade", arguments: { symbol: sym, usd: 1000, side: "buy" } } }) }).then((x) => x.json());
      const s = r.result?.structuredContent;
      setOut(JSON.stringify(s ? { decision: s.decision, evidence: s.evidence, fill: s.fill, protect: s.protect } : r, null, 2));
    } catch { setOut("Couldn't reach the server."); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-12">
      <header className="max-w-[68ch]">
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[34px]">Give your agent a limit it can&apos;t break</h1>
        <p className="mt-3 text-[16px] text-ink-2">
          Stock-data APIs tell an agent what a price is. Rehearsal also builds the trade so that the chain refuses to fill it worse than fair value, and writes the terms into the transaction so anyone can check the result. One URL, no key.
        </p>
      </header>

      <section aria-labelledby="connect" className="space-y-4">
        <h2 id="connect" className="text-[19px] font-semibold">Connect</h2>
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3">
            <span className="text-[13px] text-muted">MCP</span>
            <code className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{MCP}</code>
            <Copy text={MCP} label="MCP URL" />
          </div>
          <Segmented label="Client" value={client} onChange={setClient} options={(Object.keys(CLIENTS) as Client[]).map((k) => ({ value: k, label: CLIENTS[k].label }))} />
          <Code label={CLIENTS[client].label}>{CLIENTS[client].code}</Code>
          <p className="text-[13px] text-muted">
            Streamable HTTP, stateless. Also as REST: <a className="text-brand-ink hover:underline" href="/api/v1/openapi.json">OpenAPI</a> · <a className="text-brand-ink hover:underline" href="/llms.txt">llms.txt</a> · <a className="text-brand-ink hover:underline" href="https://github.com/Clintobi/rehearsal/blob/main/skills/rehearsal/SKILL.md" target="_blank" rel="noreferrer">SKILL.md</a>
          </p>
        </div>
      </section>

      <section aria-labelledby="mandate" className="grid gap-8 lg:grid-cols-2">
        <div className="max-w-[62ch] space-y-3">
          <h2 id="mandate" className="text-[19px] font-semibold">The mandate is enforced by the chain</h2>
          <p className="text-[15px] text-ink-2">
            Every protected swap carries one number from the user: the most the fill may be worse than fair value. Rehearsal sets Jupiter&apos;s minimum output from that, not from the quote. If prices move past it before the transaction lands, Jupiter&apos;s program reverts the whole trade. An agent can&apos;t overpay, even if its model is wrong or a thousand other bots are chasing the same pool.
          </p>
          <p className="text-[15px] text-ink-2">
            Fair value follows a <a className="text-brand-ink hover:underline" href="/api/v1/policy">published policy</a>: Pyth in the US session, the 24/7 perpetual when the market is shut, no trade while a stock is halted. The fair price, limit and floor go into a memo in the same transaction, and <code className="text-[14px]">verify_receipt</code> checks the result against it.
          </p>
          <p className="text-[13px] text-muted">
            Tested on a mainnet fork: a floor 1% above what the route could deliver reverted with Jupiter&apos;s SlippageToleranceExceeded, and protected buys and sells of NVDAx and a PreStocks token filled and verified. <a className="text-brand-ink hover:underline" href="https://github.com/Clintobi/rehearsal/blob/main/docs/fork-protect-test-output.txt" target="_blank" rel="noreferrer">Test output</a>
          </p>
        </div>
        <div className="min-w-0 space-y-3 rounded-[10px] border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">Try check_trade</span>
            <select value={sym} onChange={(e) => setSym(e.target.value)} aria-label="Stock"
              className="ml-auto rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink">
              {["NVDAx", "SPYx", "TSLAx", "AAPLx", "OPENAI", "ANTHROPIC", "SPACEX"].map((s) => <option key={s}>{s}</option>)}
            </select>
            <button onClick={run} disabled={busy} className="rounded-full bg-brand px-4 py-1.5 text-[13px] font-semibold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-60">{busy ? "Running…" : "Run"}</button>
          </div>
          <pre className={cx("max-h-80 overflow-auto rounded-lg bg-surface p-4 text-[12px] leading-relaxed", out ? "text-ink" : "text-muted")}>
            {out ?? "A $1,000 buy, checked live over MCP. Press Run."}
          </pre>
        </div>
      </section>

      <section aria-labelledby="launch" className="grid gap-6 lg:grid-cols-2">
        <div className="max-w-[62ch] space-y-3">
          <h2 id="launch" className="text-[19px] font-semibold">For launchpads: launches that stop when the stock stops</h2>
          <p className="text-[15px] text-ink-2">
            A Meteora bonding curve can be priced in a tokenized stock like SPYx. When that stock is halted, nobody knows what the curve&apos;s price is worth. The Rehearsal Gate is a Token-2022 transfer hook that reads the stock&apos;s on-chain circuit breaker, which follows Nasdaq&apos;s halt feed, and refuses every buy, sell and transfer of the launch token until trading resumes. It mirrors the rule listed markets follow. Meteora removes the hook when the curve graduates, so the pool trades normally after that.
          </p>
          <p className="text-[13px] text-muted">
            Tested against Meteora&apos;s real DBC program on a mainnet fork: a launch quoted in SPYx fills, reverts in the gate while SPY is halted, resumes after, and loses the hook at graduation (8/8). <a className="text-brand-ink hover:underline" href="https://github.com/Clintobi/rehearsal/blob/main/docs/fork-gate-test-output.txt" target="_blank" rel="noreferrer">Test output</a> · <a className="text-brand-ink hover:underline" href="https://explorer.solana.com/address/C5Guo498oPwDLvuDvZDA35M8ChrfLz9GxpbaJbm9oadn?cluster=devnet" target="_blank" rel="noreferrer">Live devnet pool gated by NVDA</a>
          </p>
        </div>
        <div className="min-w-0 space-y-2">
          <Code label="launch config">{`// 1. DBC config with the gate as its transfer hook
dbc.partner.createConfigWithTransferHook({
  ...curve, quoteMint: SPYx, tokenBadge,
  transferHookProgram: "${"4MtrgDQpbgjpzcAcL5Ftm8E1L37deBnZ5f2Pi6WmpqPE"}",
})
// 2. Pool and gate binding in one transaction
const tx = await dbc.creator.createPoolWithTransferHook({...})
tx.add(initGateIx(creator, baseMint, SPY_FEED_ID))`}</Code>
        </div>
      </section>

      <section aria-labelledby="tools" className="space-y-4">
        <h2 id="tools" className="text-[19px] font-semibold">Tools</h2>
        <div className="overflow-hidden rounded-[10px] border border-line bg-panel">
          <table className="w-full text-[14px]">
            <tbody>
              {TOOLS.map(([name, desc]) => (
                <tr key={name} className="border-b border-line last:border-0">
                  <th scope="row" className="w-[34%] px-4 py-3 text-left align-top font-mono text-[13px] font-medium text-ink">{name}</th>
                  <td className="px-4 py-3 text-ink-2">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
