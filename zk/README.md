# ZK execution report (SP1 → Solana)

The SP1 program recomputes the published report numbers from `zk/data/fills.json` without trusting any precomputed gap. Its public values commit:

- `sha256(fills.json)`
- the graded fill count
- for xStocks and PreStocks: graded count, volume, median gap, p90 gap, and fills within 25 bps

`node verify-offchain.mjs` recomputes the same bytes in plain JS.

## Verified on Solana

The Groth16 proof over the first snapshot (310 graded fills; proof files in `zk/proof/`, generated on a GitHub Actions runner by `.github/workflows/zk-proof.yml`) is verified on devnet by the Rehearsal Guard program's `attest_report` instruction:

- rebuilds SP1 v6's five public inputs (program vkey hash, masked sha256 of the public values, exit code, recursion vk root, nonce);
- runs the pairing check with the alt_bn128 syscalls (110,458 compute units);
- stores a `ReportAttestation` with the proven numbers.

Transaction: https://explorer.solana.com/tx/xWLNrsazKgyC2xADjP3nUACbvqzTYTBrfdDvPtAYtZTtvFH8UWGZkyEHBw4kjqEqfyriJcgRBrteJLfqAkNsJQk?cluster=devnet. Attestation account: `CjtFcKbRrHyBtmdSf1FagcJMzq1EYnnu5rFNdgyGrodH`. The same proof with a tampered dataset hash is rejected with `ProofInvalid` (`docs/zk-onchain-output.txt`). `zk/solana-convert` converts SP1's gnark proof and key into the syscall format.

## Bot-free dataset: execute-checked, proof pending

`zk/data/fills-botfree.json` is the dataset with wash-trading round-trippers removed: 903 graded fills, sha256 starting `d16b791f`, committed on devnet by the recorder. `--execute` over it prints:

```
d16b791f23136569d625732d70506edc864639c057175ef6fbb782566b571abf87030000730300003f1ca7b564000000000000002c000000ed0200001400000086fb77fe01000000540000004a02000005000000
```

Its Groth16 proof needs more memory than a free GitHub runner has: two runs were cut off in the proving step. `zk/data/fills.json` stays the proven 310-fill snapshot (public values `1d4b3ed6…`), matching the proof in `zk/proof/` and the attestation on devnet.

## Reproduce

```bash
curl -L https://sp1up.succinct.xyz | bash && sp1up
cd zk/script
cargo run --release -- --execute    # public values must equal the snapshot's hex (1d4b3ed6… for fills.json)
cargo run --release                 # Groth16 (Docker, 16 GB+ RAM), or dispatch .github/workflows/zk-proof.yml
```

Outputs land in `zk/out/`: `groth16_proof.hex`, `public_values.hex`, `vkey_hash.txt`, `proof.bin`. To verify on-chain, convert with `zk/solana-convert`, then run `scripts/attest-report.ts`.
