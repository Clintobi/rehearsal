// Parses Pyth's schedule attribute, e.g.
// "America/New_York;0930-1600,0930-1600,0930-1600,0930-1600,0930-1600,C,C;1126/C,1127/0930-1300"
export type MarketStatus = { open: boolean; label: string; nextChange?: string };

function nyParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday);
  return { dow, mmdd: `${p.month}${p.day}`, hhmm: Number(`${p.hour}${p.minute}`) };
}

function inRanges(spec: string, hhmm: number) {
  if (spec === "C") return false;
  if (spec === "O") return true;
  return spec.split("&").some((r) => {
    const [a, b] = r.split("-").map(Number);
    return hhmm >= a && hhmm < b;
  });
}

export function marketStatus(schedule: string | undefined, now = new Date()): MarketStatus {
  if (!schedule) return { open: false, label: "No schedule" };
  const [, week, holidays = ""] = schedule.split(";");
  const days = week.split(",");
  const { dow, mmdd, hhmm } = nyParts(now);
  const hol = holidays.split(",").find((h) => h.startsWith(mmdd + "/"));
  const spec = hol ? hol.split("/")[1] : days[dow];
  const open = inRanges(spec, hhmm);
  if (open) return { open, label: "NYSE/Nasdaq open" };
  if (hol && spec === "C") return { open, label: "US market holiday" };
  if (dow >= 5) return { open, label: "Weekend, US market closed" };
  return { open, label: hhmm < 930 ? "Pre-market, US market closed" : "After hours, US market closed" };
}
