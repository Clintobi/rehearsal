// A live Meteora DBC launch on devnet, gated by the NVDA circuit breaker that the halt relayer
// keeps in sync with Nasdaq's halt feed. Devnet has no xStocks, so this pool is quoted in SOL;
// the gate logic is identical to the SPYx-quoted fork test (docs/fork-gate-test-output.txt).
// Usage: DEVNET_RPC=<url> npx tsx scripts/devnet-gate-demo.ts
import { readFileSync } from "fs";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import {
  ActivationType, BaseFeeMode, buildCurveWithMarketCap, CollectFeeMode, DammV2BaseFeeMode, DammV2DynamicFeeMode,
  deriveDbcPoolAddress, DynamicBondingCurveClient, MigratedCollectFeeMode, MigrationFeeOption, MigrationOption,
  SwapMode, TokenAuthorityOption, TokenDecimal, TokenType,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { breakerPda } from "../src/lib/guard";
import { extraAccountMetasPda, GATE_PROGRAM_ID, initGateIx } from "../src/lib/gate";

const conn = new Connection(process.env.DEVNET_RPC ?? "https://api.devnet.solana.com", "confirmed");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("onchain/keys/deployer.json", "utf8"))));
const NVDA_FEED = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";
const ex = (k: string, kind = "address") => `https://explorer.solana.com/${kind}/${k}?cluster=devnet`;

async function send(tx: Transaction, signers: Keypair[]) {
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(...signers);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

(async () => {
  const dbc = new DynamicBondingCurveClient(conn, "confirmed");
  const curve = buildCurveWithMarketCap({
    token: { tokenType: TokenType.Token2022, tokenBaseDecimal: TokenDecimal.SIX, tokenQuoteDecimal: TokenDecimal.NINE, tokenAuthorityOption: TokenAuthorityOption.PartnerUpdateAuthority, totalTokenSupply: 1_000_000_000, leftover: 0 },
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
    initialMarketCap: 20, migrationMarketCap: 500,
  });
  const config = Keypair.generate();
  const cfgSig = await send(await dbc.partner.createConfigWithTransferHook({
    ...curve, config: config.publicKey, feeClaimer: payer.publicKey, leftoverReceiver: payer.publicKey,
    payer: payer.publicKey, quoteMint: NATIVE_MINT, transferHookProgram: GATE_PROGRAM_ID,
  }), [payer, config]);
  console.log("config", config.publicKey.toBase58(), ex(cfgSig, "tx"));

  const baseMint = Keypair.generate();
  const poolTx = await dbc.creator.createPoolWithTransferHook({
    baseMint: baseMint.publicKey, config: config.publicKey, name: "Rehearsal Gated NVDA Launch", symbol: "GATED",
    uri: "https://rehearsal-stocklana.vercel.app/agents", payer: payer.publicKey, poolCreator: payer.publicKey, transferHookProgram: GATE_PROGRAM_ID,
  });
  poolTx.add(initGateIx(payer.publicKey, baseMint.publicKey, NVDA_FEED));
  const poolSig = await send(poolTx, [payer, baseMint]);
  const pool = deriveDbcPoolAddress(NATIVE_MINT, baseMint.publicKey, config.publicKey);
  console.log("pool", pool.toBase58(), ex(poolSig, "tx"));
  console.log("mint", baseMint.publicKey.toBase58(), "gate metas", extraAccountMetasPda(baseMint.publicKey).toBase58(), "bound to breaker", breakerPda(NVDA_FEED).toBase58());

  const buySig = await send(await dbc.pool.swap2WithTransferHook({
    swapMode: SwapMode.ExactIn, swapBaseForQuote: false, amountIn: new BN(10_000_000), minimumAmountOut: new BN(0),
    owner: payer.publicKey, pool, referralTokenAccount: null, payer: payer.publicKey,
  }), [payer]);
  const logs = (await conn.getTransaction(buySig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }))?.meta?.logMessages ?? [];
  console.log("buy 0.01 SOL", ex(buySig, "tx"), "gate ran:", logs.some((l) => l.includes(GATE_PROGRAM_ID.toBase58())));
  console.log("\nWhile Nasdaq halts NVDA, the halt relayer sets the breaker and every transfer of this token reverts in the gate.");
})().catch((e) => { console.error(e); process.exit(1); });
