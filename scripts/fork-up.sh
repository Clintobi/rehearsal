#!/usr/bin/env bash
# Clean Surfpool mainnet fork with the guard deployed and live Pyth equity accounts loaded.
# Usage: MAINNET_RPC=<helius url> scripts/fork-up.sh
set -euo pipefail
cd "$(dirname "$0")/.."
pkill -9 -f "surfpool start" 2>/dev/null || true; sleep 2
rm -f /tmp/surfpool-fork.sqlite*
if lsof -iTCP:8899 -sTCP:LISTEN -n -P | grep -q surfpool; then echo "port 8899 still held by surfpool"; exit 1; fi
surfpool start -u "$MAINNET_RPC" --no-tui --no-deploy --no-studio -y > /tmp/surfpool.log 2>&1 &
until curl -s http://127.0.0.1:8899 -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' | grep -q result; do sleep 1; done
L=http://127.0.0.1:8899
solana airdrop 100 "$(solana address -k onchain/keys/deployer.json)" -u $L >/dev/null
# Surfpool has no TPU; send deploy writes over RPC, and retry if a write batch times out.
for attempt in 1 2 3; do
  if solana program deploy onchain/target/deploy/rehearsal_guard.so --program-id onchain/target/deploy/rehearsal_guard-keypair.json -k onchain/keys/deployer.json -u $L --use-rpc | tail -1; then
    solana program show TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE -u $L -k onchain/keys/deployer.json >/dev/null 2>&1 && break
  fi
  echo "deploy attempt $attempt failed, retrying"; sleep 2
done
solana program show TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE -u $L -k onchain/keys/deployer.json | grep -q "Data Length" || { echo "deploy failed"; exit 1; }
# Surfpool freezes the first copy it fetches; load the live Pyth equity accounts now.
node -e '
const {Connection,PublicKey}=require("@solana/web3.js");const x=require("./src/data/xstocks.json");
(async()=>{const m=new Connection(process.env.MAINNET_RPC);
for (const r of x.filter(r=>r.equity&&r.equity.account&&r.equity.shard===1)){const i=await m.getAccountInfo(new PublicKey(r.equity.account));
await fetch("http://127.0.0.1:8899",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"surfnet_setAccount",params:[r.equity.account,{lamports:i.lamports,data:i.data.toString("hex"),owner:i.owner.toBase58(),executable:false}]})})}
console.log("fork ready")})()'
