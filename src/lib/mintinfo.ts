import { Connection, PublicKey, type ParsedAccountData } from "@solana/web3.js";

// Token-2022 extensions that change what a trade is really worth:
// - Scaled UI Amount: wallet amount = raw × multiplier (PreStocks splits, xStocks dividends)
// - Transfer fee: charged when the holder sends tokens (PreStocks mints carry one; it is withheld on every sell)
export type MintInfo = { multiplier: number; transferFeeBps: number };

type Ext = { extension: string; state: Record<string, unknown> };
type FeeCfg = { epoch: number; transferFeeBasisPoints: number };

let cache: { at: number; m: Map<string, MintInfo> } | null = null;

// A wrong multiplier misprices by up to 5×, so a failed read must never fall back to 1×:
// retry, then serve the last good values, and only throw if there are none.
export async function mintInfos(conn: Connection, mints: string[]): Promise<Map<string, MintInfo>> {
  if (cache && Date.now() - cache.at < 300_000 && mints.every((m) => cache!.m.has(m))) return cache.m;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetchInfos(conn, mints);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  if (cache && mints.every((m) => cache!.m.has(m))) return cache.m;
  throw new Error(`Could not read Token-2022 mint data (${String(lastErr).slice(0, 80)})`);
}

async function fetchInfos(conn: Connection, mints: string[]): Promise<Map<string, MintInfo>> {
  const m = new Map<string, MintInfo>(cache?.m ?? []);
  const epoch = (await conn.getEpochInfo()).epoch;
  const now = Date.now() / 1000;
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const res = await conn.getMultipleParsedAccounts(chunk.map((x) => new PublicKey(x)));
    res.value.forEach((acc, k) => {
      if (!acc) throw new Error(`mint ${chunk[k]} not found`);
      const exts = ((acc?.data as ParsedAccountData | undefined)?.parsed?.info?.extensions ?? []) as Ext[];
      const s = exts.find((e) => e.extension === "scaledUiAmountConfig")?.state as
        | { multiplier: string; newMultiplier?: string; newMultiplierEffectiveTimestamp?: number } | undefined;
      let multiplier = 1;
      if (s?.multiplier) {
        const useNew = s.newMultiplier && s.newMultiplierEffectiveTimestamp && now >= s.newMultiplierEffectiveTimestamp;
        multiplier = Number(useNew ? s.newMultiplier : s.multiplier);
      }
      const f = exts.find((e) => e.extension === "transferFeeConfig")?.state as { newerTransferFee: FeeCfg; olderTransferFee: FeeCfg } | undefined;
      const transferFeeBps = f ? (epoch >= f.newerTransferFee.epoch ? f.newerTransferFee : f.olderTransferFee).transferFeeBasisPoints : 0;
      m.set(chunk[k], { multiplier, transferFeeBps });
    });
  }
  cache = { at: Date.now(), m };
  return m;
}
