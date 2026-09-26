import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Scores a Monday Call round: each stock's close on the round date and the open of the next
// session, from Yahoo's daily bars (the same source as the weekend study). A stock with no
// next session yet comes back without an open.
const UA = { "User-Agent": "Mozilla/5.0" };
const nyDate = (unix: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(unix * 1000));

export async function GET(req: NextRequest) {
  const round = req.nextUrl.searchParams.get("round") ?? "";
  const tickers = (req.nextUrl.searchParams.get("tickers") ?? "").split(",").filter((t) => /^[A-Z.]{1,6}$/.test(t)).slice(0, 12);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(round) || !tickers.length) return NextResponse.json({ error: "round and tickers are required" }, { status: 400 });

  const out: Record<string, { close: number; open: number | null; openDate: string | null }> = {};
  await Promise.all(tickers.map(async (t) => {
    try {
      const j = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=1mo&interval=1d`, { headers: UA, next: { revalidate: 120 } }).then((r) => r.json());
      const r = j.chart?.result?.[0];
      const q = r?.indicators?.quote?.[0];
      const days = ((r?.timestamp ?? []) as number[]).map((ts, i) => ({ date: nyDate(ts), open: q.open[i] as number | null, close: q.close[i] as number | null }));
      const i = days.findIndex((d) => d.date === round);
      if (i < 0 || !days[i].close) return;
      const next = days.slice(i + 1).find((d) => d.open);
      out[t] = { close: days[i].close!, open: next?.open ?? null, openDate: next?.date ?? null };
    } catch { /* leave this ticker out */ }
  }));
  return NextResponse.json({ round, opens: out }, { headers: { "cache-control": "public, s-maxage=120" } });
}
