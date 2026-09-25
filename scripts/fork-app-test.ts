// Drives the app's own API the way the browser does (rehearse → guarded-swap → sign → send),
// against a Surfpool mainnet fork. Run the dev server with GUARD_RPC pointing at the fork.
import { forkConnection } from "./fork-conn";
import { Connection, Keypair, LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";

const APP = process.env.APP ?? "http://127.0.0.1:3311";
const FORK = process.env.FORK_RPC ?? "http://127.0.0.1:8899";
const conn = forkConnection(FORK);
const user = Keypair.generate();

async function rpc(method: string, params: unknown[]) {
  const j = await (await fetch(FORK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

// Surfpool keeps its first copy of an account, so push the live mainnet Pyth account into the fork.
async function refreshFromMainnet(pubkey: string) {
  const main = new Connection(process.env.MAINNET_RPC ?? "https://api.mainnet-beta.solana.com");
  const a = await main.getAccountInfo(new (await import("@solana/web3.js")).PublicKey(pubkey));
  if (!a) return;
  await rpc("surfnet_setAccount", [pubkey, { lamports: a.lamports, data: a.data.toString("hex"), owner: a.owner.toBase58(), executable: a.executable }]);
}

async function trade(label: string, mint: string, usd: number, tol: number) {
  const r = await (await fetch(`${APP}/api/rehearse?mint=${mint}&usd=${usd}&side=buy`)).json();
  if (r.error) return console.log(`FAIL ${label}: rehearse ${r.error}`);
  if (r.reference?.account) await refreshFromMainnet(r.reference.account);
  const b = await (await fetch(`${APP}/api/guarded-swap`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ quote: r.quote, userPublicKey: user.publicKey.toBase58(), toleranceBps: tol }) })).json();
  if (b.error) return console.log(`FAIL ${label}: guarded-swap ${b.error}`);
  const tx = VersionedTransaction.deserialize(Buffer.from(b.swapTransaction, "base64"));
  tx.sign([user]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed").catch(() => {});
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  const guardLine = t?.meta?.logMessages?.find((l) => l.includes("Guard:")) ?? "";
  const failed = t?.meta?.logMessages?.find((l) => l.includes(" failed: ")) ?? "";
  console.log(`${t?.meta?.err ? "REVERTED" : "FILLED  "} ${label} | verdict: ${r.verdict.headline.slice(0, 90)} | policy ${JSON.stringify(b.policy.reference)} tol ${tol}bps ${guardLine.replace("Program log: ", "")} ${t?.meta?.err ? failed : ""}`);
}

(async () => {
  await conn.confirmTransaction(await conn.requestAirdrop(user.publicKey, 5 * LAMPORTS_PER_SOL));
  await rpc("surfnet_setTokenAccount", [user.publicKey.toBase58(), "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", { amount: 5_000_000_000 }, "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"]);
  await trade("AAPLx $200, Pyth, 1%", "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", 200, 100);
  await trade("OPENAI $200, mark, 5%", "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF", 200, 500);
  await trade("OPENAI $200, mark, 40%", "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF", 200, 4000);
})();
