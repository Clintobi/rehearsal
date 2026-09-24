import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { ACTION_HEADERS, assetBySymbol, origin } from "@/lib/actions";
import { rehearse } from "@/lib/rehearse";
import { buildSwap } from "@/lib/jup";
import { guardedSwapTx } from "@/lib/guarded";

export const maxDuration = 30;
const GUARD_LIVE = process.env.NEXT_PUBLIC_GUARD_LIVE === "1";
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

// GET: the Blink card. The image and description carry the live fair-price verdict.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/actions/rehearse/[symbol]">) {
  const { symbol } = await ctx.params;
  const asset = await assetBySymbol(symbol);
  const base = origin(req.url);
  if (!asset) return NextResponse.json({ message: `Unknown token ${symbol}` }, { status: 404, headers: ACTION_HEADERS });

  const r = await rehearse(asset, 1000, "buy").catch(() => null);
  const ok = r && !("error" in r);
  const gap = ok && r.premiumPct != null ? r.premiumPct : null;
  const refLabel = asset.pyth ? `Pyth's on-chain price of ${asset.pyth.ticker}` : "the PreStocks mark";
  const bad = ok && r.verdict.level === "bad";
  const href = (usd: string) => `${base}/api/actions/rehearse/${asset.symbol}?usd=${usd}`;
  const buyLabel = (usd: string) => (bad ? `Buy $${usd} anyway` : `Buy $${usd}`);

  return NextResponse.json({
    type: "action",
    icon: `${base}/api/actions/card/${asset.symbol}?t=${Math.floor(Date.now() / 60_000)}`,
    title: gap == null ? `${asset.name}: check the price before you buy` : `${asset.symbol} fills ${pct(gap)} vs ${asset.kind === "prestock" ? "its PreStocks mark" : "the real stock"} right now`,
    description: ok
      ? `${r.verdict.headline} A $1,000 buy fills at $${r.fillPrice.toFixed(2)} on Jupiter vs $${r.reference?.price.toFixed(2) ?? "?"} from ${refLabel}, after Token-2022 fees and multipliers.${
          GUARD_LIVE ? " Buys run inside the Rehearsal Guard program, which reverts the trade if the fill is worse than fair value by more than your tolerance." : ""}`
      : `Live Jupiter quote vs ${refLabel}.`,
    label: "Buy",
    links: {
      actions: [
        { type: "transaction", label: buyLabel("25"), href: href("25") },
        { type: "transaction", label: buyLabel("100"), href: href("100") },
        { type: "transaction", label: bad ? "Buy anyway" : "Buy", href: `${href("{amount}")}`,
          parameters: [{ type: "number", name: "amount", label: "USDC amount", required: true, min: 1, max: 50_000 }] },
        { type: "external-link", label: "Full rehearsal", href: `${base}/?t=${asset.symbol}` },
      ],
    },
  }, { headers: ACTION_HEADERS });
}

export const OPTIONS = async () => new NextResponse(null, { headers: ACTION_HEADERS });

// POST: build the buy for the clicking wallet, re-quoted at click time.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/actions/rehearse/[symbol]">) {
  const { symbol } = await ctx.params;
  const usd = Number(req.nextUrl.searchParams.get("usd"));
  const { account } = await req.json().catch(() => ({ account: null }));
  try { new PublicKey(account); } catch { return NextResponse.json({ message: "Invalid wallet" }, { status: 400, headers: ACTION_HEADERS }); }
  if (!(usd >= 1 && usd <= 50_000)) return NextResponse.json({ message: "Amount must be between $1 and $50,000" }, { status: 400, headers: ACTION_HEADERS });
  const asset = await assetBySymbol(symbol);
  if (!asset) return NextResponse.json({ message: `Unknown token ${symbol}` }, { status: 404, headers: ACTION_HEADERS });

  const r = await rehearse(asset, usd, "buy");
  if ("error" in r) return NextResponse.json({ message: r.error }, { status: 502, headers: ACTION_HEADERS });
  const tol = asset.kind === "prestock" ? 500 : 100;
  const built = GUARD_LIVE ? await guardedSwapTx(r.quote, account, tol).catch(() => null) : await buildSwap(r.quote, account);
  const transaction = built?.swapTransaction;
  if (!transaction) return NextResponse.json({ message: "Jupiter could not build this swap" }, { status: 502, headers: ACTION_HEADERS });
  const gap = r.premiumPct != null ? ` ${pct(r.premiumPct)} vs ${asset.kind === "prestock" ? "the PreStocks mark" : "Pyth"}.` : "";
  return NextResponse.json({
    type: "transaction",
    transaction,
    message: `Buying ${r.tokens.toFixed(4)} ${asset.symbol} at $${r.fillPrice.toFixed(2)}.${gap}${GUARD_LIVE ? ` Guarded: reverts if worse than fair by more than ${tol / 100}%.` : ""}`,
  }, { headers: ACTION_HEADERS });
}
