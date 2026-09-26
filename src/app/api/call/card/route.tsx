import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { fmtDay, fmtPct, parseShare } from "@/lib/call";

// The picture a shared Monday Call unfurls as: a score, or a set of calls.
export async function GET(req: NextRequest) {
  const s = parseShare((k) => req.nextUrl.searchParams.get(k));
  const ink = "#15161a", muted = "#5b5f6b", good = "#0e7a4b", bad = "#b42318", paper = "#f7f7f5";
  const who = s.name ?? "A player";
  const title = s.you
    ? `${who} called ${s.you[0]} of ${s.you[1]} opens right`
    : s.calls.length ? `${who}'s Monday Call` : "Monday Call";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: paper, padding: 64, fontFamily: "sans-serif", color: ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#2459c9", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 26, fontWeight: 700 }}>R</div>
          <div style={{ fontSize: 28, fontWeight: 600 }}>Rehearsal</div>
          <div style={{ fontSize: 24, color: muted, marginLeft: "auto" }}>{s.round ? `Round of ${fmtDay(s.round)}` : "Monday Call"}</div>
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, marginTop: 56, letterSpacing: -1.5, lineHeight: 1.1 }}>{title}</div>
        {s.you ? (
          <div style={{ display: "flex", gap: 24, marginTop: 44 }}>
            {[["You", `${s.you[0]}/${s.you[1]}`], ["Rehearsal's model", s.model ? `${s.model[0]}/${s.model[1]}` : "—"], ["Points", s.pts != null ? String(s.pts) : "—"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", background: "#fff", border: "2px solid #e4e4e0", borderRadius: 20, padding: "20px 30px", minWidth: 220 }}>
                <div style={{ fontSize: 24, color: muted }}>{k}</div>
                <div style={{ fontSize: 64, fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 44 }}>
            {s.calls.map((c) => (
              <div key={c.ticker} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "2px solid #e4e4e0", borderRadius: 20, padding: "16px 26px" }}>
                <div style={{ fontSize: 34, fontWeight: 700 }}>{c.ticker}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 34, fontWeight: 700, color: c.dir > 0 ? good : bad }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={c.dir > 0 ? good : bad} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d={c.dir > 0 ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M19 12l-7 7-7-7"} />
                  </svg>
                  {c.dir > 0 ? "Up" : "Down"}
                </div>
                {c.pct != null && <div style={{ fontSize: 30, color: muted }}>{fmtPct(c.pct, 1)}</div>}
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 26, color: muted, marginTop: "auto" }}>Stocks trade as tokens all weekend. Call where they open on Monday, free.</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
