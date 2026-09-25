# ZK execution report (SP1 → Solana)

**Submission check:** the `--execute` run below, together with the live grades. **Not in the submission:** Groth16. Local Groth16 is the optional next step, after submit. The Succinct Prover Network is that same step once the requester account has PROVE credits. Do not start a network proof for the submission.

The program recomputes the published report numbers from `data/fills.json` (310 graded fills sampled from mainnet). Its public values commit:

- `sha256(fills.json)`
- the graded fill count
- for xStocks and PreStocks: graded count, volume, median gap, p90 gap, and fills within 25 bps

`node verify-offchain.mjs` recomputes the same bytes in plain JS.

Expected public values for the current `fills.json`:
```
1d4b3ed610384ec03abd824de75a387c17bc526c40ee3f4b0f4429884e0f144c36010000310100008fc4415b250000000300000038000000f000000005000000ef48fd5e00000000200000001501000002000000
```

## The check that already passed

```bash
curl -L https://sp1up.succinct.xyz | bash && sp1up      # installs cargo-prove + the succinct toolchain
git clone https://github.com/Clintobi/rehearsal && cd rehearsal/zk
cd script
cargo run --release -- --execute    # public values must equal the hex above
```

Built and checked on SP1 v6.8.1: `--execute` runs in 6.54M instructions and prints exactly the public values above. That is the submission check.

## Later: Groth16 (after submit)

Local Groth16 needs 16 GB+ RAM and Docker, and takes 10–40 minutes:

```bash
cd zk/script
cargo run --release
```

Outputs in `zk/out/`: `groth16_proof.hex`, `public_values.hex`, `vkey_hash.txt`, `proof.bin`.

`zk/run-proof.sh` is that full local path (install, `--execute`, then Groth16). It is not the submission command.

Succinct Prover Network, only when the requester account is funded with PROVE. Do not start this for the submission:

```bash
SP1_PROVER=network NETWORK_PRIVATE_KEY=<requester key> cargo run --release
```

The Solana program's `attest_report` instruction is the verifier for that later Groth16 proof.
