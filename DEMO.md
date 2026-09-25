# Rehearsal demo

**Live:** https://rehearsal-stocklana.vercel.app · **Repo:** https://github.com/Clintobi/rehearsal

Rehearsal gives every tokenized stock on Solana a passport (what you hold, how good the price evidence is right now, whether you can get out), then builds a swap the chain won't fill worse than fair value and writes the receipt into the transaction. Numbers on screen are live and move.

## 90-second walkthrough

1. **Passport (30 s).** Open https://rehearsal-stocklana.vercel.app/app?t=NVDAx.
   - The verdict compares your $1,000 fill with the price the [policy](https://rehearsal-stocklana.vercel.app/api/v1/policy) picks for this hour: Pyth's on-chain price in the US session, the Lighter 24/7 perp outside it.
   - Scroll to **Passport**: what an xStock legally is, and live proof of reserves.
   - **Can you get out**: sell depth within 1/2/5%.
   - **What you paid**: the protected price.
2. **Pre-IPO (20 s).** Open https://rehearsal-stocklana.vercel.app/app/private.
   - OpenAI's token values the company about 32% over PreStocks' mark.
   - The break-even listing value is shown after the 1% fees.
   - Click OpenAI: its largest wallet could sell only a few percent of its position before the price drops 5%.
3. **Protect (15 s).** Back on Trade, **Price protection** is on.
   - The swap's minimum output is set from fair value, so Jupiter's program reverts anything worse, on mainnet.
   - With a funded wallet, a small buy returns a verified receipt.
   - Without one: `docs/fork-protect-test-output.txt` shows a floor 1% above the route reverting inside Jupiter, and protected buys/sells (including a PreStocks buy after the 1% fee) filling and verifying.
4. **Agents (10 s).** Open https://rehearsal-stocklana.vercel.app/agents and press **Run**: a live `check_trade` over MCP. The MCP URL works in Claude Code, Cursor and any MCP client, no key.
5. **Prove (15 s).** Open https://rehearsal-stocklana.vercel.app/report.
   - Real fills graded against fair value, with wash-trading bots excluded (the count is in the header).
   - **Check these numbers yourself**: the published dataset and its SHA-256 committed on Solana.
   - The Groth16 proof of the report is verified on-chain by the guard program ([devnet tx](https://explorer.solana.com/tx/xWLNrsazKgyC2xADjP3nUACbvqzTYTBrfdDvPtAYtZTtvFH8UWGZkyEHBw4kjqEqfyriJcgRBrteJLfqAkNsJQk?cluster=devnet)).
6. **Meteora (optional).** https://rehearsal-stocklana.vercel.app/agents#launch: the Rehearsal Gate pauses a launch priced in SPYx while SPY is halted.
   - Fork test 8/8 with Meteora's real DBC program: `docs/fork-gate-test-output.txt`.
   - Live devnet pool gated by NVDA: `docs/devnet-gate-output.txt`.

## Proof, precisely

- **On-chain Groth16 verification:** the SP1 report program's proof over the 310-fill snapshot (generated on GitHub Actions) is verified by `attest_report` on devnet in 110,458 compute units ([tx](https://explorer.solana.com/tx/xWLNrsazKgyC2xADjP3nUACbvqzTYTBrfdDvPtAYtZTtvFH8UWGZkyEHBw4kjqEqfyriJcgRBrteJLfqAkNsJQk?cluster=devnet), attestation `CjtFcKbRrHyBtmdSf1FagcJMzq1EYnnu5rFNdgyGrodH`). A tampered dataset hash is rejected (`ProofInvalid`). See `docs/zk-onchain-output.txt`.
- **The bot-free dataset:** `zk/data/fills-botfree.json` (903 graded fills, sha256 `d16b791f…`, committed on devnet) passes the `--execute` check (18.9M instructions). Its Groth16 proof needs a bigger machine than the free GitHub runner, which was cut off twice while proving; the on-chain proof above covers the 310-fill snapshot.
- **Anyone can recompute:** `node zk/verify-offchain.mjs fills.json` recomputes every committed number from the raw fills with the same integer math as the ZK program.

## Blink

- Solana Action (live): https://rehearsal-stocklana.vercel.app/api/actions/rehearse/OPENAI
- Shareable link: https://rehearsal-stocklana.vercel.app/rehearse/OPENAI
- The dial.to public registry is paused (`DEPLOYMENT_PAUSED`, HTTP 503), so there is no registry listing.
