import { allAssets } from "./assets";

// Solana Actions spec headers. Blink clients (X via Dialect, Phantom, dial.to) fetch
// cross-origin, so every response, OPTIONS included, carries these.
export const ACTION_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids",
  "Access-Control-Expose-Headers": "X-Action-Version, X-Blockchain-Ids",
  "X-Action-Version": "2.4",
  "X-Blockchain-Ids": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "Content-Type": "application/json",
};

export async function assetBySymbol(symbol: string) {
  const s = symbol.toLowerCase();
  return (await allAssets()).find((a) => a.symbol.toLowerCase() === s);
}

export const origin = (url: string) => new URL(url).origin;
