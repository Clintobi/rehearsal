//! SP1 program: recomputes the Rehearsal execution report from raw fills.
//! It does not trust any precomputed gap. Each fill's gap is derived from its fill and
//! reference prices, and the committed output is:
//!   sha256(input) | fills | then per asset class (xstock, prestock):
//!   graded u32 | volume_usd_e6 u64 | median_gap_bps i32 | p90_gap_bps i32 | within_25bps u32
//! all little-endian. Anyone can recompute the same bytes from zk/data/fills.json.
#![no_main]
sp1_zkvm::entrypoint!(main);

use serde::Deserialize;
use sha2::{Digest, Sha256};

#[derive(Deserialize)]
struct Fill {
    kind: String,
    side: String,
    usd_e6: u64,
    fill_e6: u64,
    ref_e6: u64,
}

fn gap_bps(f: &Fill) -> i64 {
    let (fill, r) = (f.fill_e6 as i128, f.ref_e6 as i128);
    // positive = worse than the reference for the trader
    let bps = if f.side == "buy" { (fill - r) * 10_000 / r } else { (r - fill) * 10_000 / r };
    bps as i64
}

fn pct(sorted: &[i64], q_num: usize, q_den: usize) -> i32 {
    if sorted.is_empty() {
        return 0;
    }
    sorted[(sorted.len() - 1) * q_num / q_den] as i32
}

fn summarize(fills: &[&Fill], out: &mut Vec<u8>) {
    let mut gaps: Vec<i64> = fills.iter().map(|f| gap_bps(f)).collect();
    gaps.sort_unstable();
    let volume: u64 = fills.iter().map(|f| f.usd_e6).sum();
    let within = gaps.iter().filter(|g| **g <= 25).count() as u32;
    out.extend_from_slice(&(gaps.len() as u32).to_le_bytes());
    out.extend_from_slice(&volume.to_le_bytes());
    out.extend_from_slice(&pct(&gaps, 1, 2).to_le_bytes());
    out.extend_from_slice(&pct(&gaps, 9, 10).to_le_bytes());
    out.extend_from_slice(&within.to_le_bytes());
}

pub fn main() {
    let data: Vec<u8> = sp1_zkvm::io::read_vec();
    let digest = Sha256::digest(&data);
    let fills: Vec<Fill> = serde_json::from_slice(&data).expect("fills.json");
    let graded: Vec<&Fill> = fills.iter().filter(|f| f.ref_e6 > 0 && f.usd_e6 >= 10_000_000).collect();

    let mut out = Vec::with_capacity(32 + 4 + 2 * 24);
    out.extend_from_slice(&digest);
    out.extend_from_slice(&(graded.len() as u32).to_le_bytes());
    let x: Vec<&Fill> = graded.iter().copied().filter(|f| f.kind == "xstock").collect();
    let p: Vec<&Fill> = graded.iter().copied().filter(|f| f.kind == "prestock").collect();
    summarize(&x, &mut out);
    summarize(&p, &mut out);
    sp1_zkvm::io::commit_slice(&out);
}
