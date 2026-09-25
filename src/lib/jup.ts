export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUP = process.env.JUP_API ?? "https://lite-api.jup.ag/swap/v1";

export type Quote = {
  inputMint: string; inAmount: string; outputMint: string; outAmount: string;
  priceImpactPct: string; slippageBps: number;
  routePlan: { swapInfo: { label: string; ammKey: string }; percent: number }[];
};

const cache = new Map<string, { at: number; q: Quote | { error: string } }>();

export async function quote(inputMint: string, outputMint: string, amount: bigint, slippageBps = 100): Promise<Quote | { error: string }> {
  const key = `${inputMint}:${outputMint}:${amount}:${slippageBps}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit.q;
  // JUP_DEXES pins routes to AMMs a local mainnet fork can execute (tests only).
  const dexes = process.env.JUP_DEXES ? `&dexes=${encodeURIComponent(process.env.JUP_DEXES)}` : "";
  const url = `${JUP}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}${dexes}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { cache: "no-store" });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 700 * (attempt + 1))); continue; }
    const q = await r.json();
    const out = q.outAmount ? (q as Quote) : { error: q.error ?? `Jupiter ${r.status}` };
    cache.set(key, { at: Date.now(), q: out });
    return out;
  }
  return { error: "Jupiter rate limit, try again in a few seconds" };
}

export async function buildSwap(quoteResponse: Quote, userPublicKey: string) {
  const r = await fetch(`${JUP}/swap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse, userPublicKey, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 2_000_000, priorityLevel: "high" } },
    }),
  });
  return r.json();
}

// Instruction-level swap, for transactions that add their own instructions around Jupiter's.
export async function swapInstructions(quoteResponse: Quote, userPublicKey: string) {
  const r = await fetch(`${JUP}/swap-instructions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse, userPublicKey, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 2_000_000, priorityLevel: "high" } },
    }),
  });
  return r.json();
}
