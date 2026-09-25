// Rehearsal Gate on a Surfpool mainnet fork, with Meteora's real DBC program and the real SPYx
// token badge: a launch quoted in SPYx whose token stops trading while SPY is halted.
// Needs the fork from scripts/fork-up.sh and the gate program deployed to it.
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import BN from "bn.js";
import {
  ActivationType, BaseFeeMode, buildCurveWithMarketCap, CollectFeeMode, DammV2BaseFeeMode, DammV2DynamicFeeMode,
  deriveDbcPoolAddress, deriveTokenBadgeAddress, DynamicBondingCurveClient, MigratedCollectFeeMode, MigrationFeeOption,
  MigrationOption, SwapMode, TokenAuthorityOption, TokenDecimal, TokenType,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { getAssociatedTokenAddressSync, getMint, getTransferHook } from "@solana/spl-token";
import { forkConnection } from "./fork-conn";
import { breakerPda, initBreakerIx, setHaltIx, TOKEN_2022_PROGRAM } from "../src/lib/guard";
import { extraAccountMetasPda, GATE_PROGRAM_ID, initGateIx } from "../src/lib/gate";

const FORK = process.env.FORK_RPC ?? "http://127.0.0.1:8899";
const conn = forkConnection(FORK);
const SPYX = new PublicKey("XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W");
const SPY_FEED = "19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5";
const results: { name: string; pass: boolean; detail: string }[] = [];
const record = (name: string, pass: boolean, detail: string) => { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`); };
const rpc = async (method: string, params: unknown[]) => {
  const j = await (await fetch(FORK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
};

async function sendTx(tx: Transaction, signers: Keypair[]) {
  tx.feePayer = signers[0].publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(...signers);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed").catch(() => {});
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  const code = JSON.stringify(t?.meta?.err ?? "").match(/"Custom":(\d+)/)?.[1];
  const failed = t?.meta?.logMessages?.find((l) => l.includes(" failed: "))?.split(" ")[1] ?? "";
  return { sig, ok: !!t && !t.meta?.err, code: code ? Number(code) : null, failed, logs: t?.meta?.logMessages ?? [] };
}

(async () => {
  const partner = Keypair.generate(), creator = Keypair.generate(), user = Keypair.generate();
  for (const k of [partner, creator, user]) await conn.confirmTransaction(await conn.requestAirdrop(k.publicKey, 10 * LAMPORTS_PER_SOL));
  await rpc("surfnet_setTokenAccount", [user.publicKey.toBase58(), SPYX.toBase58(), { amount: 50_000_000_000 }, TOKEN_2022_PROGRAM.toBase58()]); // 500 SPYx (raw)
  const dbc = new DynamicBondingCurveClient(conn, "confirmed");

  // Circuit breaker for SPY, the stock this launch is quoted in.
  const b = await sendTx(new Transaction().add(initBreakerIx(partner.publicKey, SPY_FEED, 500, 15, 300, 600)), [partner]);
  record("1. circuit breaker for SPY exists", b.ok, `breaker ${breakerPda(SPY_FEED).toBase58()} ${b.ok ? "" : b.logs.slice(-2).join(" | ")}`);

  // DBC config: quoted in SPYx (Meteora token badge), Token-2022 base with the Rehearsal Gate hook,
  // anti-sniper fee that decays from 25% to 1% over the first 10 minutes, fees kept in SPYx,
  // graduation to DAMM v2 with all LP permanently locked.
  const curve = buildCurveWithMarketCap({
    token: { tokenType: TokenType.Token2022, tokenBaseDecimal: TokenDecimal.SIX, tokenQuoteDecimal: 8, tokenAuthorityOption: TokenAuthorityOption.PartnerUpdateAuthority, totalTokenSupply: 1_000_000_000, leftover: 0 },
    fee: {
      baseFeeParams: { baseFeeMode: BaseFeeMode.FeeSchedulerExponential, feeSchedulerParam: { startingFeeBps: 2500, endingFeeBps: 100, numberOfPeriod: 60, totalDuration: 600 } },
      dynamicFeeEnabled: true, collectFeeMode: CollectFeeMode.QuoteToken, creatorTradingFeePercentage: 50, poolCreationFee: 0, enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2, migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: { collectFeeMode: MigratedCollectFeeMode.QuoteToken, dynamicFee: DammV2DynamicFeeMode.Enabled, poolFeeBps: 100, baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear },
    },
    liquidityDistribution: { partnerLiquidityPercentage: 0, partnerPermanentLockedLiquidityPercentage: 50, creatorLiquidityPercentage: 0, creatorPermanentLockedLiquidityPercentage: 50 },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
    activationType: ActivationType.Timestamp,
    initialMarketCap: 10, // in SPYx: the whole launch starts at 10 shares of the S&P 500
    migrationMarketCap: 200,
  });
  const config = Keypair.generate();
  const tokenBadge = deriveTokenBadgeAddress(SPYX);
  const cfgTx = await dbc.partner.createConfigWithTransferHook({
    ...curve, config: config.publicKey, feeClaimer: partner.publicKey, leftoverReceiver: partner.publicKey,
    payer: partner.publicKey, quoteMint: SPYX, transferHookProgram: GATE_PROGRAM_ID, tokenBadge,
  });
  const c = await sendTx(cfgTx, [partner, config]);
  record("2. DBC config quoted in SPYx with the Rehearsal Gate hook", c.ok, c.ok ? `config ${config.publicKey.toBase58()}, badge ${tokenBadge.toBase58()}` : `${c.failed} ${c.code} ${c.logs.slice(-3).join(" | ")}`);
  if (!c.ok) return finish();

  // Pool + gate binding in one transaction, so nobody can bind the mint to a different breaker first.
  const baseMint = Keypair.generate();
  const poolTx = await dbc.creator.createPoolWithTransferHook({
    baseMint: baseMint.publicKey, config: config.publicKey, name: "Gated Launch", symbol: "GATE", uri: "https://rehearsal-stocklana.vercel.app/agents",
    payer: creator.publicKey, poolCreator: creator.publicKey, transferHookProgram: GATE_PROGRAM_ID, tokenBadge,
  });
  poolTx.add(initGateIx(creator.publicKey, baseMint.publicKey, SPY_FEED));
  const p = await sendTx(poolTx, [creator, baseMint]);
  const pool = deriveDbcPoolAddress(SPYX, baseMint.publicKey, config.publicKey);
  record("3. pool created and bound to the SPY breaker atomically", p.ok, p.ok ? `pool ${pool.toBase58()}, extra-account-metas ${extraAccountMetasPda(baseMint.publicKey).toBase58()}` : `${p.failed} ${p.code} ${p.logs.slice(-3).join(" | ")}`);
  if (!p.ok) return finish();

  const buy = async () => sendTx(await dbc.pool.swap2WithTransferHook({
    swapMode: SwapMode.ExactIn, swapBaseForQuote: false, amountIn: new BN(1_000_000), minimumAmountOut: new BN(0),
    owner: user.publicKey, pool, referralTokenAccount: null, payer: user.publicKey,
  }), [user]);

  const b1 = await buy();
  record("4. buy on the curve while SPY trades normally: fills", b1.ok, b1.ok ? `tx ${b1.sig.slice(0, 16)}… (hook ran: ${b1.logs.some((l) => l.includes(GATE_PROGRAM_ID.toBase58()))})` : `${b1.failed} ${b1.code} ${b1.logs.slice(-3).join(" | ")}`);

  const h = await sendTx(new Transaction().add(setHaltIx(partner.publicKey, SPY_FEED, true, "T1")), [partner]);
  if (!h.ok) console.log("      (set_halt failed:", h.logs.slice(-2).join(" | "), ")");
  const b2 = await buy();
  record("5. SPY halted (T1): the same buy reverts in the gate", !b2.ok && b2.failed === GATE_PROGRAM_ID.toBase58() && b2.code === 6000,
    `ok=${b2.ok}, failed in ${b2.failed || "?"} with ${b2.code} (6000 = ExchangeHalted)`);
  const held = (await conn.getTokenAccountBalance(getAssociatedTokenAddressSync(baseMint.publicKey, user.publicKey, false, TOKEN_2022_PROGRAM))).value.amount;
  const s1 = await sendTx(await dbc.pool.swap2WithTransferHook({
    swapMode: SwapMode.ExactIn, swapBaseForQuote: true, amountIn: new BN(held).divn(2), minimumAmountOut: new BN(0),
    owner: user.publicKey, pool, referralTokenAccount: null, payer: user.publicKey,
  }), [user]);
  record("6. selling during the halt is paused too", !s1.ok && s1.failed === GATE_PROGRAM_ID.toBase58() && s1.code === 6000, `ok=${s1.ok}, failed in ${s1.failed || "?"} with ${s1.code}`);

  await sendTx(new Transaction().add(setHaltIx(partner.publicKey, SPY_FEED, false)), [partner]);
  const b3 = await buy();
  record("7. halt lifted: buys fill again", b3.ok, b3.ok ? `tx ${b3.sig.slice(0, 16)}…` : `${b3.failed} ${b3.code}`);

  // Buy the rest of the curve: DBC completes it and revokes the hook, so the graduated token trades freely.
  const big = await sendTx(await dbc.pool.swap2WithTransferHook({
    swapMode: SwapMode.PartialFill, swapBaseForQuote: false, amountIn: new BN(40_000_000_000), minimumAmountOut: new BN(0),
    owner: user.publicKey, pool, referralTokenAccount: null, payer: user.publicKey,
  }), [user]);
  const mint = await getMint(conn, baseMint.publicKey, "confirmed", TOKEN_2022_PROGRAM);
  const hook = getTransferHook(mint);
  const st = (await dbc.state.getPool(pool)) as unknown as Record<string, unknown> | null;
  const reserve = String((st?.quoteReserve as BN | undefined)?.toString() ?? "?");
  const complete = st ? Number(st.isMigrated ?? 0) === 1 || Number(st.migrationProgress ?? 0) > 0 : false;
  record("8. the curve completes and DBC removes the hook for the graduated token", big.ok && (!hook || hook.programId.equals(PublicKey.default)),
    `swap ok=${big.ok}; hook program now ${hook ? hook.programId.toBase58() : "none"}; quote reserve ${reserve} raw SPYx; ${complete ? "curve complete" : ""} ${big.ok ? "" : big.logs.slice(-3).join(" | ")}`);
  finish();
})().catch((e) => { console.error(e); record("unexpected error", false, String(e).slice(0, 400)); finish(); });

function finish() {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}
void sendAndConfirmTransaction;
