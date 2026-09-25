# ZK-proven execution report (SP1 → Solana)

Proves that the published report numbers were computed correctly from `data/fills.json` (310 graded fills sampled from mainnet). The proof commits:

- `sha256(fills.json)`
- the graded fill count
- for xStocks and PreStocks: graded count, volume, median gap, p90 gap, and fills within 25 bps

`node verify-offchain.mjs` recomputes the same bytes in plain JS.

Expected public values for the current `fills.json`:
```
1d4b3ed610384ec03abd824de75a387c17bc526c40ee3f4b0f4429884e0f144c36010000310100008fc4415b250000000300000038000000f000000005000000ef48fd5e00000000200000001501000002000000
```

## Running the prover (needs 16 GB+ RAM and Docker running)

```bash
curl -L https://sp1up.succinct.xyz | bash && sp1up      # installs cargo-prove + the succinct toolchain
git clone https://github.com/Clintobi/rehearsal && cd rehearsal/zk
cd script
cargo run --release -- --execute    # 1) fast check: public values must equal the hex above
cargo run --release                 # 2) Groth16 proof (Docker must be running), takes 10-40 min
```

Outputs in `zk/out/`: `groth16_proof.hex`, `public_values.hex`, `vkey_hash.txt`, `proof.bin`.

Built and checked on SP1 v6.8.1: `--execute` runs in 6.54M instructions and prints exactly the public values above.

One command does everything (installs Rust + SP1, checks, proves, writes one result file):
```bash
curl -fsSL https://raw.githubusercontent.com/Clintobi/rehearsal/main/zk/run-proof.sh | bash
```

On the Succinct Prover Network instead of a local machine: `SP1_PROVER=network NETWORK_PRIVATE_KEY=<requester key> cargo run --release` (requester account funded with PROVE).

Send back the three text files in `zk/out/`. The Solana side verifies the Groth16 proof with `sp1-solana`.
