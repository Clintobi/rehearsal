import type { Metadata } from "next";
import study from "../../../../data/weekend.json";
import xstocks from "@/data/xstocks.json";
import type { PracticeCard } from "@/lib/call";
import CallGame from "./CallGame";

export const metadata: Metadata = {
  title: "Monday Call",
  description: "Call where Nvidia, Tesla and more open on Monday. Play against Rehearsal's weekend forecast, practice on real past weekends, and share your calls.",
};

type Row = { fri: string; mon: string; closeFri: number; openMon: number; rTok: number; rAct: number };
type XRow = { symbol: string; ticker: string; name: string; icon: string };

// Every past weekend in the study becomes a practice card: Friday's close, the token's
// weekend move on Solana, and the real Monday open.
function deck(): PracticeCard[] {
  const stocks = (study as unknown as { stocks: Record<string, { ticker: string; rows: Row[] }> }).stocks;
  const x = xstocks as unknown as XRow[];
  return Object.entries(stocks).flatMap(([symbol, s]) => {
    const meta = x.find((r) => r.symbol === symbol);
    return s.rows.map((r) => ({
      symbol, ticker: s.ticker, name: meta?.name.replace(/ xStock$/, "") ?? s.ticker, icon: meta?.icon ?? "",
      fri: r.fri, mon: r.mon, closeFri: r.closeFri, openMon: r.openMon, tokenMove: r.rTok, actualMove: r.rAct,
    }));
  });
}

export default function CallPage() {
  return <CallGame deck={deck()} />;
}
