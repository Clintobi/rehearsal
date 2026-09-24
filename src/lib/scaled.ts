import { Connection, PublicKey, type ParsedAccountData } from "@solana/web3.js";

// Token-2022 Scaled UI Amount: what wallets show = raw amount × multiplier.
// PreStocks uses it for splits (SpaceX 5×); xStocks use it to pass through dividends.
type Ext = { extension: string; state: { multiplier?: string; newMultiplier?: string; newMultiplierEffectiveTimestamp?: number } };

let cache: { at: number; m: Map<string, number> } | null = null;

export async function uiMultipliers(conn: Connection, mints: string[]): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.at < 300_000 && mints.every((m) => cache!.m.has(m))) return cache.m;
  const m = new Map<string, number>(cache?.m ?? []);
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const res = await conn.getMultipleParsedAccounts(chunk.map((x) => new PublicKey(x)));
    res.value.forEach((acc, k) => {
      const exts = ((acc?.data as ParsedAccountData | undefined)?.parsed?.info?.extensions ?? []) as Ext[];
      const s = exts.find((e) => e.extension === "scaledUiAmountConfig")?.state;
      let mult = 1;
      if (s?.multiplier) {
        const now = Date.now() / 1000;
        mult = Number(s.newMultiplier && s.newMultiplierEffectiveTimestamp && now >= s.newMultiplierEffectiveTimestamp ? s.newMultiplier : s.multiplier);
      }
      m.set(chunk[k], mult);
    });
  }
  cache = { at: Date.now(), m };
  return m;
}
