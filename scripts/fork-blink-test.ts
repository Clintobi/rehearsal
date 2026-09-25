// Clicks the Blink the way a wallet does (GET card → POST {account} → sign → send), on the fork.
import { forkConnection } from "./fork-conn";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
const APP = process.env.APP ?? "http://127.0.0.1:3311";
const FORK = process.env.FORK_RPC ?? "http://127.0.0.1:8899";
const conn = forkConnection(FORK);
const user = Keypair.generate();
const rpc = async (method: string, params: unknown[]) => (await (await fetch(FORK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()).result;

async function refresh(pubkey: string) {
  const a = await new Connection(process.env.MAINNET_RPC!).getAccountInfo(new PublicKey(pubkey));
  if (a) await rpc("surfnet_setAccount", [pubkey, { lamports: a.lamports, data: a.data.toString("hex"), owner: a.owner.toBase58(), executable: a.executable }]);
}

(async () => {
  await conn.confirmTransaction(await conn.requestAirdrop(user.publicKey, 5 * LAMPORTS_PER_SOL));
  await rpc("surfnet_setTokenAccount", [user.publicKey.toBase58(), "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", { amount: 1_000_000_000 }, "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"]);
  for (const sym of ["NVDAx", "OPENAI"]) {
    const card = await (await fetch(`${APP}/api/actions/rehearse/${sym}`)).json();
    const buy = card.links.actions.find((a: { label: string }) => /\$25/.test(a.label));
    await refresh("5VETJ8h3p4JrESYrzhjTDAWPEjDjfcnduqe9CjxgqBNd");
    const post = await (await fetch(buy.href.replace(/^https?:\/\/[^/]+/, APP), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: user.publicKey.toBase58() }) })).json();
    if (!post.transaction) { console.log(sym, "POST failed", post); continue; }
    const tx = VersionedTransaction.deserialize(Buffer.from(post.transaction, "base64"));
    tx.sign([user]);
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    await conn.confirmTransaction(sig, "confirmed").catch(() => {});
    const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    const g = t?.meta?.logMessages?.find((l) => l.includes("Guard:"))?.replace("Program log: ", "") ?? "";
    const f = t?.meta?.logMessages?.filter((l) => / failed: |Error Message/.test(l)).join(" || ") ?? "";
    console.log(f);
    console.log(`${sym} | card: "${card.title}" | button "${buy.label}" | ${post.message} | ${t?.meta?.err ? "REVERTED " + g : "FILLED"}`);
  }
})();
