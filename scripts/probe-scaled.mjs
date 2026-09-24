import { Connection, PublicKey } from "@solana/web3.js";
import fs from "fs";
const c = new Connection("https://api.mainnet-beta.solana.com");
const x = JSON.parse(fs.readFileSync("src/data/xstocks.json")).map(r=>[r.symbol,r.mint]);
const pre = (await (await fetch("https://prestocks.com/api/prestocks")).json()).map(r=>[r.symbol,r.contract_address]);
const all=[...x,...pre];
const res = await c.getMultipleParsedAccounts(all.map(a=>new PublicKey(a[1])));
res.value.forEach((a,i)=>{const e=(a.data.parsed.info.extensions||[]).find(e=>e.extension==="scaledUiAmountConfig");console.log(all[i][0], a.owner.toBase58().slice(0,6), e?JSON.stringify(e.state):"none")});
