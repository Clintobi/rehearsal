import { Connection, PublicKey } from "@solana/web3.js";
import { allAssets } from "./assets";
import { buildGuardedSwap, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, type Policy } from "./guard";
import { USDC, type Quote } from "./jup";

const JUP = process.env.JUP_API ?? "https://lite-api.jup.ag/swap/v1";

// [open_guard → Jupiter swap → close_guard] for `userPublicKey` to sign, on the cluster
// where the guard program lives (GUARD_RPC).
export async function guardedSwapTx(quote: Quote, userPublicKey: string, toleranceBps: number) {
  const tol = Math.max(0, Math.min(5000, Math.round(toleranceBps)));
  const side: "buy" | "sell" = quote.inputMint === USDC ? "buy" : "sell";
  const stockMint = side === "buy" ? quote.outputMint : quote.inputMint;
  const asset = (await allAssets()).find((a) => a.mint === stockMint);
  if (!asset) throw new Error("Guard supports xStocks and PreStocks against USDC");

  let policy: Policy;
  let priceUpdate: PublicKey | undefined;
  if (asset.pyth) {
    policy = { side, reference: { kind: "pyth", feedId: asset.pyth.feed, maxAgeSecs: 600, maxConfBps: 200 }, toleranceBps: tol };
    priceUpdate = new PublicKey(asset.pyth.account);
  } else if (asset.mark) {
    policy = { side, reference: { kind: "limit", priceE6: BigInt(Math.round(asset.mark.price * 1e6)) }, toleranceBps: tol };
  } else {
    throw new Error("No fair-value reference for this token");
  }

  const ixs = await (await fetch(`${JUP}/swap-instructions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey, dynamicComputeUnitLimit: false,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 2_000_000, priorityLevel: "high" } } }),
  })).json();
  if (ixs.error || !ixs.swapInstruction) throw new Error(ixs.error ?? "Jupiter could not build the swap");

  const conn = new Connection(process.env.GUARD_RPC ?? process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com", "confirmed");
  const legs = {
    user: new PublicKey(userPublicKey),
    inputMint: new PublicKey(quote.inputMint), inputTokenProgram: side === "buy" ? TOKEN_PROGRAM : TOKEN_2022_PROGRAM,
    outputMint: new PublicKey(quote.outputMint), outputTokenProgram: side === "buy" ? TOKEN_2022_PROGRAM : TOKEN_PROGRAM,
    priceUpdate,
  };
  const { tx, lastValidBlockHeight } = await buildGuardedSwap(conn, ixs, legs, policy);
  return {
    swapTransaction: Buffer.from(tx.serialize()).toString("base64"), lastValidBlockHeight,
    policy: { ...policy, reference: policy.reference.kind === "pyth" ? { kind: "pyth", feed: `Equity.US.${asset.pyth!.ticker}/USD` } : { kind: "limit", price: asset.mark!.price } },
  };
}
