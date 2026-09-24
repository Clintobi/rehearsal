import { PublicKey, type ParsedAccountData } from "@solana/web3.js";
import { allAssets, xstockData } from "./assets";
import { quote, USDC } from "./jup";
import { mintInfos } from "./mintinfo";
import { readPrices } from "./pyth";
import { rpc } from "./rehearse";

const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

export type Holding = {
  symbol: string; name: string; kind: "xstock" | "prestock"; mint: string; icon?: string;
  shares: number; // as the wallet displays them
  fairPrice: number | null; fairSource: string | null; fairValue: number | null;
  exitValue: number | null; // USDC from selling everything on Jupiter now, after the transfer fee
  exitGapPct: number | null; // how much below fair the exit is
  transferFeeBps: number; multiplier: number;
};

export async function walletHoldings(address: string) {
  const owner = new PublicKey(address);
  const conn = rpc();
  const assets = await allAssets();
  const byMint = new Map(assets.map((a) => [a.mint, a]));
  const accs = await conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022 });
  const raw = new Map<string, bigint>();
  for (const { account } of accs.value) {
    const info = (account.data as ParsedAccountData).parsed.info;
    if (!byMint.has(info.mint)) continue;
    raw.set(info.mint, (raw.get(info.mint) ?? 0n) + BigInt(info.tokenAmount.amount));
  }
  const mints = [...raw.keys()].filter((m) => raw.get(m)! > 0n);
  if (!mints.length) return { address, holdings: [] as Holding[], totals: { fair: 0, exit: 0, stuck: 0 } };
  const held = mints.map((m) => byMint.get(m)!);
  const [infos, prices, sd] = await Promise.all([
    mintInfos(conn, mints),
    readPrices(conn, held.filter((a) => a.pyth).map((a) => a.pyth!.account)),
    xstockData().catch(() => new Map()),
  ]);
  const pythPx = new Map(held.filter((a) => a.pyth).map((a, i) => [a.mint, prices[i]?.price ?? null]));

  const holdings: Holding[] = [];
  for (const a of held) {
    const info = infos.get(a.mint) ?? { multiplier: 1, transferFeeBps: 0 };
    const r = raw.get(a.mint)!;
    const shares = (Number(r) / 10 ** a.decimals) * info.multiplier;
    let fairPrice: number | null = null, fairSource: string | null = null;
    if (a.pyth && pythPx.get(a.mint)) { fairPrice = pythPx.get(a.mint)!; fairSource = `Pyth ${a.pyth.ticker}`; }
    else if (a.mark) { fairPrice = a.mark.price; fairSource = "PreStocks mark"; }
    else if (sd.get(a.mint)) { fairPrice = sd.get(a.mint)!.price; fairSource = "xStocks reference"; }
    const sellRaw = BigInt(Math.floor(Number(r) * (1 - info.transferFeeBps / 10_000)));
    const q = sellRaw > 0n ? await quote(a.mint, USDC, sellRaw) : { error: "empty" };
    const exitValue = "error" in q ? null : Number(q.outAmount) / 1e6;
    const fairValue = fairPrice ? fairPrice * shares : null;
    holdings.push({
      symbol: a.symbol, name: a.name, kind: a.kind, mint: a.mint, icon: a.icon, shares,
      fairPrice, fairSource, fairValue, exitValue,
      exitGapPct: fairValue && exitValue != null ? (1 - exitValue / fairValue) * 100 : null,
      transferFeeBps: info.transferFeeBps, multiplier: info.multiplier,
    });
  }
  const shown = holdings.filter((h) => (h.fairValue ?? h.exitValue ?? 0) >= 1).sort((x, y) => (y.fairValue ?? 0) - (x.fairValue ?? 0));
  const totals = {
    fair: shown.reduce((s, h) => s + (h.fairValue ?? 0), 0),
    exit: shown.reduce((s, h) => s + (h.exitValue ?? 0), 0),
    // Positions Jupiter can't route in one go: their fair value has no on-chain exit today.
    stuck: shown.filter((h) => h.exitValue == null).reduce((s, h) => s + (h.fairValue ?? 0), 0),
  };
  return { address, holdings: shown, totals };
}
