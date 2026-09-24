import { Connection, PublicKey } from "@solana/web3.js";

// Pyth Solana push oracle. Sponsored feeds live at PDA([shard u16 LE, feedId]).
export const PYTH_PUSH_ORACLE = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");

export type OnchainPrice = {
  account: string;
  price: number;
  conf: number;
  publishTime: number;
  emaPrice: number;
};

export function feedAccount(feedIdHex: string, shard = 1): PublicKey {
  const s = Buffer.alloc(2);
  s.writeUInt16LE(shard);
  return PublicKey.findProgramAddressSync([s, Buffer.from(feedIdHex, "hex")], PYTH_PUSH_ORACLE)[0];
}

// PriceUpdateV2: disc(8) write_authority(32) verification_level(1|2) PriceFeedMessage posted_slot
export function decodePriceUpdate(data: Buffer, account: string): OnchainPrice {
  let o = 8 + 32;
  o += data[o] === 0 ? 2 : 1;
  o += 32; // feed_id
  const price = data.readBigInt64LE(o); o += 8;
  const conf = data.readBigUInt64LE(o); o += 8;
  const expo = data.readInt32LE(o); o += 4;
  const publishTime = Number(data.readBigInt64LE(o)); o += 8;
  o += 8; // prev_publish_time
  const ema = data.readBigInt64LE(o);
  const scale = 10 ** expo;
  return { account, price: Number(price) * scale, conf: Number(conf) * scale, publishTime, emaPrice: Number(ema) * scale };
}

export async function readPrices(conn: Connection, accounts: string[]): Promise<(OnchainPrice | null)[]> {
  if (!accounts.length) return [];
  const infos = await conn.getMultipleAccountsInfo(accounts.map((a) => new PublicKey(a)));
  return infos.map((info, i) => (info ? decodePriceUpdate(info.data as Buffer, accounts[i]) : null));
}
