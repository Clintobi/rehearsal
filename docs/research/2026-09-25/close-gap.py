# Proxy for "Pyth's last regular-session price vs the official close":
# the last 2-minute bar before 16:00 New York vs the official daily close (Yahoo).
import json, time, urllib.request, datetime, statistics
TICKERS = ["NVDA", "TSLA", "AAPL", "AMZN", "AMD", "SPY", "QQQ", "MSTR", "COIN", "HOOD", "META", "MSFT"]
NY = datetime.timezone(datetime.timedelta(hours=-4))  # EDT through 1 Nov
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())
rows = []
for t in TICKERS:
    d = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{t}?range=1mo&interval=1d")["chart"]["result"][0]
    official = {datetime.datetime.fromtimestamp(ts, NY).date(): c for ts, c in zip(d["timestamp"], d["indicators"]["quote"][0]["close"]) if c}
    m = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{t}?range=1mo&interval=2m")["chart"]["result"][0]
    last = {}
    for ts, c in zip(m["timestamp"], m["indicators"]["quote"][0]["close"]):
        if c is None:
            continue
        dt = datetime.datetime.fromtimestamp(ts, NY)
        if dt.hour == 15 and dt.minute >= 58:  # the 15:58-16:00 bar
            last[dt.date()] = c
    for day, pre in last.items():
        if day in official and day < datetime.date(2026, 9, 25):
            rows.append((t, str(day), official[day], pre, (pre / official[day] - 1) * 1e4))
    time.sleep(0.5)
json.dump(rows, open("close_gap2.json", "w"))
g = sorted(abs(r[4]) for r in rows)
print(f"stock-days {len(rows)} ({rows[0][1] if rows else ''}..)")
print(f"|last price before 16:00 - official close|: median {statistics.median(g):.1f} bps, p90 {g[int(len(g)*.9)]:.1f}, p99 {g[int(len(g)*.99)]:.1f}, max {g[-1]:.1f}")
print("within 5 bps:", round(sum(x <= 5 for x in g) / len(g), 2), "| within 10:", round(sum(x <= 10 for x in g) / len(g), 2), "| over 25:", round(sum(x > 25 for x in g) / len(g), 3))
for t in TICKERS:
    x = [abs(r[4]) for r in rows if r[0] == t]
    if x: print(f"  {t:5} n={len(x):2} median {statistics.median(x):5.1f}  max {max(x):6.1f} bps")
print("largest:")
for r in sorted(rows, key=lambda r: -abs(r[4]))[:6]:
    print(f"  {r[0]:5} {r[1]} official {r[2]:.2f} last-before-close {r[3]:.2f} gap {r[4]:+.1f} bps")
