import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { assetBySymbol } from "@/lib/actions";
import { rehearse } from "@/lib/rehearse";

// The Blink's image: the live verdict for a $1,000 buy, rendered on request.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/actions/card/[symbol]">) {
  const { symbol } = await ctx.params;
  const asset = await assetBySymbol(symbol);
  const r = asset ? await rehearse(asset, 1000, "buy").catch(() => null) : null;
  const ok = r && !("error" in r);
  const gap = ok ? r.premiumPct : null;
  const level = ok ? r.verdict.level : "unknown";
  const color = level === "good" ? "#0e7a4b" : level === "bad" ? "#b42318" : level === "warn" ? "#a35f00" : "#6b6b73";
  const bg = level === "good" ? "#e6f4ec" : level === "bad" ? "#fde8e6" : level === "warn" ? "#fdf1dc" : "#f5f4ef";
  const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const refLabel = asset?.pyth ? `Pyth ${asset.pyth.ticker} (on-chain)` : "PreStocks mark";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f5f4ef", padding: 56, fontFamily: "sans-serif", color: "#15161a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: "#15161a", color: "#f5f4ef", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700 }}>R</div>
          <div style={{ fontSize: 30, fontWeight: 600 }}>Rehearsal</div>
          <div style={{ fontSize: 24, color: "#6b6b73", marginLeft: "auto" }}>fair-price check · Solana</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 120 }}>
          <div style={{ fontSize: 34, color: "#6b6b73" }}>{`Buying $1,000 of ${asset?.symbol ?? symbol.toUpperCase()} right now`}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginTop: 12 }}>
            <div style={{ fontSize: 168, fontWeight: 700, color, letterSpacing: -4 }}>{gap == null ? "—" : `${gap > 0 ? "+" : ""}${gap.toFixed(1)}%`}</div>
            <div style={{ fontSize: 34, color: "#6b6b73" }}>{`vs ${refLabel}`}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", background: "#fff", border: "2px solid #e3e1d9", borderRadius: 18, padding: "18px 26px" }}>
            <div style={{ fontSize: 22, color: "#6b6b73" }}>Your fill</div>
            <div style={{ fontSize: 40, fontWeight: 700 }}>{ok ? usd(r.fillPrice) : "—"}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", background: "#fff", border: "2px solid #e3e1d9", borderRadius: 18, padding: "18px 26px" }}>
            <div style={{ fontSize: 22, color: "#6b6b73" }}>Fair price</div>
            <div style={{ fontSize: 40, fontWeight: 700 }}>{ok && r.reference ? usd(r.reference.price) : "—"}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", background: bg, borderRadius: 18, padding: "18px 26px", width: "100%" }}>
            <div style={{ fontSize: 22, color }}>{ok && r.overpayUsd != null ? (asset?.kind === "prestock" ? (r.overpayUsd >= 0 ? "Above the mark" : "Below the mark") : r.overpayUsd >= 0 ? "Over fair value" : "Under fair value") : "Verdict"}</div>
            <div style={{ fontSize: 40, fontWeight: 700, color }}>{ok && r.overpayUsd != null ? usd(Math.abs(r.overpayUsd)) : level}</div>
          </div>
        </div>
        <div style={{ fontSize: 22, color: "#6b6b73", marginTop: "auto" }}>{`Live Jupiter quote · Token-2022 fees and multipliers included · ${new Date().toUTCString().slice(0, 22)} UTC`}</div>
      </div>
    ),
    { width: 1080, height: 1080, headers: { "Cache-Control": "public, max-age=60" } },
  );
}
