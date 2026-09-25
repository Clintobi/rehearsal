#!/usr/bin/env bash
# One-shot: generate the Rehearsal report's ZK proof and write the result to one file.
#
#   curl -fsSL https://raw.githubusercontent.com/Clintobi/rehearsal/main/zk/run-proof.sh | bash
#
# Needs: Linux, macOS, or Windows via WSL2 (Ubuntu); Docker running; 16 GB+ RAM; ~15 GB disk.
# Takes 20-60 minutes the first time (installs Rust + SP1, compiles, then proves).
set -euo pipefail

EXPECTED="1d4b3ed610384ec03abd824de75a387c17bc526c40ee3f4b0f4429884e0f144c36010000310100008fc4415b250000000300000038000000f000000005000000ef48fd5e00000000200000001501000002000000"
WORK="$HOME/rehearsal-proof"
RESULT="$HOME/rehearsal-proof-result.txt"
say() { printf "\n\033[1m==> %s\033[0m\n" "$*"; }

say "Checking Docker (needed for the final proof step)"
if ! docker info >/dev/null 2>&1; then
  echo "Docker isn't running. Start Docker Desktop (on Windows: enable WSL integration for Ubuntu in Docker Desktop settings), then run this again."
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  say "Installing build tools (may ask for your password)"
  sudo apt-get update -y && sudo apt-get install -y build-essential pkg-config libssl-dev git curl clang protobuf-compiler
fi

if ! command -v cargo >/dev/null 2>&1; then
  say "Installing Rust"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
# shellcheck disable=SC1091
source "$HOME/.cargo/env"

if [ ! -x "$HOME/.sp1/bin/sp1up" ]; then
  say "Installing SP1"
  curl -L https://sp1up.succinct.xyz | bash
fi
"$HOME/.sp1/bin/sp1up"
export PATH="$HOME/.sp1/bin:$PATH"

say "Getting the code"
if [ -d "$WORK/.git" ]; then git -C "$WORK" pull --ff-only; else git clone https://github.com/Clintobi/rehearsal "$WORK"; fi
cd "$WORK/zk/script"

say "Step 1/2: correctness check (fast, no proof yet)"
cargo run --release -- --execute | tee /tmp/rehearsal-execute.log
GOT=$(cat ../out/public_values.hex)
if [ "$GOT" != "$EXPECTED" ]; then
  echo "Public values don't match what was expected. Send this whole terminal output back instead."
  exit 1
fi
echo "Check passed."

say "Step 2/2: generating the proof (20-40 minutes, the computer will be busy)"
cargo run --release

say "Writing the result"
{
  echo "=== vkey_hash.txt ==="; cat ../out/vkey_hash.txt; echo
  echo "=== public_values.hex ==="; cat ../out/public_values.hex; echo
  echo "=== groth16_proof.hex ==="; cat ../out/groth16_proof.hex; echo
} > "$RESULT"
echo
echo "Done. Send this file back: $RESULT"
