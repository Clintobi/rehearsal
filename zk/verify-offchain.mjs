// Recomputes the SP1 program's public values in plain JS, so anyone can check the
// committed report without running a prover:  node zk/verify-offchain.mjs
import { readFileSync } from "fs";
import { createHash } from "crypto";
const raw = readFileSync(new URL("./data/fills.json", import.meta.url));
const fills = JSON.parse(raw).filter((f) => f.ref_e6 > 0 && f.usd_e6 >= 10_000_000);
const gap = (f) => { const a = BigInt(f.fill_e6), r = BigInt(f.ref_e6); return Number(f.side === "buy" ? (a - r) * 10000n / r : (r - a) * 10000n / r); };
const out = [createHash("sha256").update(raw).digest()];
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
out.push(u32(fills.length));
for (const kind of ["xstock", "prestock"]) {
  const fs = fills.filter((f) => f.kind === kind);
  const g = fs.map(gap).sort((a, b) => a - b);
  const pct = (n, d) => (g.length ? g[Math.floor(((g.length - 1) * n) / d)] : 0);
  out.push(u32(g.length), u64(fs.reduce((s, f) => s + f.usd_e6, 0)), i32(pct(1, 2)), i32(pct(9, 10)), u32(g.filter((x) => x <= 25).length));
  console.log(kind, { graded: g.length, median_bps: pct(1, 2), p90_bps: pct(9, 10), within_25bps: g.filter((x) => x <= 25).length });
}
console.log("public values:", Buffer.concat(out).toString("hex"));
