# Rehearsal demo

**Live:** https://rehearsal-stocklana.vercel.app

**Repo:** https://github.com/Clintobi/rehearsal

Rehearsal is a fair-price check for tokenized stocks on Solana (xStocks and PreStocks). Three steps, in order:

1. **Check.** Quote the order you are about to sign on Jupiter, and compare it with Pyth's price for the real share, or with the PreStocks mark for a pre-IPO token. The gap is in dollars and percent. Token-2022 transfer fees and split multipliers are already in the number.
2. **Protect.** The Rehearsal Guard program wraps the swap and cancels the whole transaction if the fill is worse than fair value by more than the wallet's tolerance. The program is on devnet (`TSjcyXhvjYT9wVNcGehoYNCZavry7rmMhkbukhmDxiE`). On the live app, price protection is marked as coming to mainnet.
3. **Prove.** Real fills are graded and published. For this submission, prove means those live grades plus an SP1 `--execute` check whose public values match the snapshot below. It does not mean a Groth16 proof, and it does not mean the Succinct Prover Network.

## 60–90 second walkthrough

Use the live site. Read the numbers on the screen. They move.

1. **Check (about 30 seconds).** Open https://rehearsal-stocklana.vercel.app/app?t=OPENAI. Leave the side on Buy and the amount at $1,000. OPENAI is a PreStocks token. The verdict is the dollars between the Jupiter fill and the PreStocks mark. Open **Price details** and point at the 1% transfer fee, which is included in the fill.
2. **Protect (about 15 seconds).** On the same screen, **Price protection** is the on-chain guard. The live app says it is coming to mainnet and links the devnet program. Do not wait to connect a wallet. The guard's job is to cancel a fill that lands too far from fair value. Fork tests in the repo show an OPENAI buy blocked when the fill was far over the mark.
3. **Prove (about 30 seconds).** Open https://rehearsal-stocklana.vercel.app/report. Show the US-stock median and the PreStocks median (distance from the mark, not a legal NBBO). Open **Check these numbers yourself**: the dataset is published and its SHA-256 is committed on Solana. The cryptographic check for tonight is the SP1 execute public values below, not a network proof.

Optional last click, if there is time: https://rehearsal-stocklana.vercel.app/app/markets and filter to Pre-IPO.

## What "prove" means tonight

Two things, and only these two:

- **Live grades** at https://rehearsal-stocklana.vercel.app/report. Sampled mainnet fills, scored against Pyth or the PreStocks mark, with the dataset and its on-chain fingerprint.
- **The SP1 `--execute` check, which already passed.** From `zk/script`:

```bash
cargo run --release -- --execute
```

On SP1 v6.8.1 that run prints these public values (also in `zk/README.md`):

```
1d4b3ed610384ec03abd824de75a387c17bc526c40ee3f4b0f4429884e0f144c36010000310100008fc4415b250000000300000038000000f000000005000000ef48fd5e00000000200000001501000002000000
```

They commit the SHA-256 of the 310-fill snapshot, the graded counts, and the median, p90, and within-25-bps shares for xStocks and PreStocks. Re-running `--execute` should print the same hex.

Local Groth16 (`cargo run --release`, needs Docker) is the next step, after this submission. The Succinct Prover Network is the same step once the requester account has PROVE credits. Neither is part of tonight's ship. See `zk/README.md`.

## Blink

The Solana Action is live:

https://rehearsal-stocklana.vercel.app/api/actions/rehearse/OPENAI

A shareable app link for the same token: https://rehearsal-stocklana.vercel.app/rehearse/OPENAI

The dial.to **public registry** listing was blocked (`DEPLOYMENT_PAUSED`, HTTP 503). Email has already been sent to Dialect. There is no public registry listing. Do not treat a dial.to search result as one.
