// Connection for Surfpool forks. Surfpool's in-memory mode can't serve signature
// subscriptions, so confirmations poll getSignatureStatuses instead of using websockets.
import { Connection, type Commitment } from "@solana/web3.js";

export function forkConnection(url: string, commitment: Commitment = "confirmed") {
  const conn = new Connection(url, { commitment, disableRetryOnRateLimit: true });
  const poll = async (sig: string) => {
    for (let i = 0; i < 60; i++) {
      const s = (await conn.getSignatureStatuses([sig])).value[0];
      if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return { context: { slot: s.slot }, value: { err: s.err } };
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`not confirmed: ${sig}`);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (conn as any).confirmTransaction = (arg: string | { signature: string }) => poll(typeof arg === "string" ? arg : arg.signature);
  return conn;
}
