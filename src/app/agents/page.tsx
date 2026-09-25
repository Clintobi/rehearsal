"use client";
import { useState } from "react";
import { Button, cx, PageHeader, Segmented } from "@/components/ui";

const MCP = "https://rehearsal-stocklana.vercel.app/api/mcp";
const TOOLS: [string, string][] = [
  ["passport", "Token structure, price source, sell depth and a decision."],
  ["build_protected_swap", "Unsigned swap that reverts below fair value minus your limit."],
  ["verify_receipt", "Checks a confirmed swap against its written floor."],
  ["check_trade", "Price check only."],
  ["market_status", "Sessions, halts, breakers and 24/7 prices."],
  ["prestocks_research", "Pre-IPO valuations, premiums and break-even."],
  ["agent_scorecard", "A wallet's fills graded against fair value."],
  ["execution_report", "Fill quality by token, session and size."],
  ["price_policy", "Which price each trade is judged against."],
  ["list_stocks", "Covered stocks and reference prices."],
];

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }}
      className="shrink-0 rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink" aria-label={`Copy ${label}`}>
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
      <PageHeader title="API" sub="MCP and REST for agents and apps. No key." />

      <section aria-labelledby="connect" className="grid gap-10 lg:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <h2 id="connect" className="text-[15px] font-semibold">Connect</h2>
          <div className="flex items-center gap-3 rounded-lg border border-line px-3.5 py-2.5">
            <span className="text-[12.5px] text-muted">MCP</span>
            <code className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{MCP}</code>
            <Copy text={MCP} label="MCP URL" />
          </div>
          <Segmented size="sm" label="Client" value={client} onChange={setClient} options={(Object.keys(CLIENTS) as Client[]).map((k) => ({ value: k, label: CLIENTS[k].label }))} />
          <Code label={CLIENTS[client].label}>{CLIENTS[client].code}</Code>
          <p className="text-[12.5px] text-muted">
            <a className="text-brand-ink hover:underline" href="/api/v1/openapi.json">OpenAPI</a> · <a className="text-brand-ink hover:underline" href="/llms.txt">llms.txt</a> · <a className="text-brand-ink hover:underline" href="/api/v1/policy">Price policy</a> · <a className="text-brand-ink hover:underline" href="https://github.com/Clintobi/rehearsal/blob/main/skills/rehearsal/SKILL.md" target="_blank" rel="noreferrer">SKILL.md</a>
          </p>
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold">Try check_trade</h2>
            <select value={sym} onChange={(e) => setSym(e.target.value)} aria-label="Stock"
              className="ml-auto h-8 rounded-md border border-line bg-bg px-2 text-[13px] text-ink">
              {["NVDAx", "SPYx", "TSLAx", "AAPLx", "OPENAI", "ANTHROPIC", "SPACEX"].map((s) => <option key={s}>{s}</option>)}
            </select>
            <Button size="sm" onClick={run} loading={busy}>Run</Button>
          </div>
          <pre className={cx("h-[252px] overflow-auto rounded-lg bg-surface p-4 text-[12px] leading-relaxed", out ? "text-ink" : "text-muted")}>
            {out ?? "$1,000 buy, live over MCP."}
          </pre>
        </div>
      </section>

      <section aria-labelledby="tools" className="space-y-3">
        <h2 id="tools" className="text-[15px] font-semibold">Tools</h2>
        <table className="w-full border-y border-line text-[14px]">
          <tbody>
            {TOOLS.map(([name, desc]) => (
              <tr key={name} className="border-b border-line last:border-0">
                <th scope="row" className="w-[38%] py-2.5 pr-4 text-left align-top font-mono text-[12.5px] font-medium text-ink">{name}</th>
                <td className="py-2.5 text-muted">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="launch" aria-labelledby="launch-h" className="grid gap-10 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 id="launch-h" className="text-[15px] font-semibold">Launchpads</h2>
          <p className="max-w-[52ch] text-[14px] text-muted">A Meteora DBC transfer hook that pauses a stock-quoted launch while that stock is halted. Removed at graduation.</p>
          <p className="text-[12.5px]"><a className="text-brand-ink hover:underline" href="https://explorer.solana.com/address/C5Guo498oPwDLvuDvZDA35M8ChrfLz9GxpbaJbm9oadn?cluster=devnet" target="_blank" rel="noreferrer">Devnet pool</a> · <a className="text-brand-ink hover:underline" href="https://github.com/Clintobi/rehearsal/blob/main/docs/fork-gate-test-output.txt" target="_blank" rel="noreferrer">Tests</a></p>
        </div>
        <div className="min-w-0">
          <Code label="launch config">{`dbc.partner.createConfigWithTransferHook({
  ...curve, quoteMint: SPYx, tokenBadge,
  transferHookProgram: "4MtrgDQpbgjpzcAcL5Ftm8E1L37deBnZ5f2Pi6WmpqPE",
})
tx.add(initGateIx(creator, baseMint, SPY_FEED_ID))`}</Code>
        </div>
      </section>
    </div>
  );
}
