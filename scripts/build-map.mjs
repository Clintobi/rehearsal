import { Connection, PublicKey } from "@solana/web3.js";
import fs from "fs";
const PUSH = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");
const c = new Connection(process.env.RPC || "https://api.mainnet-beta.solana.com");
const toks = await (await fetch("https://lite-api.jup.ag/tokens/v2/search?query=xStock")).json();
const eq = await (await fetch("https://hermes.pyth.network/v2/price_feeds?asset_type=equity")).json();
const cr = await (await fetch("https://hermes.pyth.network/v2/price_feeds?asset_type=crypto")).json();
const pda = (id, shard) => { const s = Buffer.alloc(2); s.writeUInt16LE(shard); return PublicKey.findProgramAddressSync([s, Buffer.from(id,"hex")], PUSH)[0]; };
async function live(id){ for (const sh of [1,0]) { const p=pda(id,sh); const a=await c.getAccountInfo(p); if(!a) continue; const d=a.data; let o=40; o+= d[o]===0?2:1; o+=32+8+8+4; const age=Date.now()/1000-Number(d.readBigInt64LE(o)); if(age<86400*4) return {account:p.toBase58(), shard:sh, age:Math.round(age)}; } return null; }
const out = [];
for (const t of toks.filter(t=>t.symbol.endsWith("x") && t.isVerified)) {
  const tick = t.symbol.slice(0,-1);
  const e = eq.find(f=>f.attributes.symbol===`Equity.US.${tick}/USD`);
  const x = cr.find(f=>f.attributes.symbol===`Crypto.${tick.toUpperCase()}X/USD`);
  const row = { symbol:t.symbol, ticker:tick, name:t.name, mint:t.id, decimals:t.decimals, icon:t.icon,
    equity: e ? { id:e.id, schedule:e.attributes.schedule, ...(await live(e.id)) } : null,
    xfeed: x ? { id:x.id, ...(await live(x.id)) } : null };
  console.log(row.symbol, row.decimals, row.equity?.account?"EQ:"+row.equity.shard+" age "+row.equity.age:"eq-", row.xfeed?.account?"X:"+row.xfeed.age:"x-");
  out.push(row);
}
fs.mkdirSync("src/data",{recursive:true});
fs.writeFileSync("src/data/xstocks.json", JSON.stringify(out,null,1));
