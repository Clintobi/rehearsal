//! On-chain verification of the execution report's SP1 v6 Groth16 proof.
//!
//! The SP1 program in zk/program recomputes the report from raw fills and commits
//! `sha256(dataset) | fills | xStock stats | PreStocks stats`. SP1 v6 wraps that in a Groth16
//! proof with five public inputs: [program vkey hash, sha256(public values) masked to 253 bits,
//! exit code, recursion vk root, nonce]. We rebuild those inputs here and run the pairing check
//! with Solana's alt_bn128 syscalls, so the report's numbers are verified by the chain itself.
use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;
use solana_bn254::prelude::{alt_bn128_addition, alt_bn128_multiplication, alt_bn128_pairing};

use crate::errors::GuardError;
use crate::zk_vk::{ALPHA_G1, BETA_G2, DELTA_G2, GAMMA_G2, IC, REPORT_PROGRAM_VKEY_HASH};

/// SP1 v6.8.1 recursion verifying-key root.
pub const VK_ROOT: [u8; 32] = [
    0x00, 0x2f, 0x85, 0x0e, 0xe9, 0x98, 0x97, 0x4d, 0x6c, 0xc0, 0x0e, 0x50, 0xcd, 0x08, 0x14, 0xb0,
    0x98, 0xc0, 0x5b, 0xfa, 0xde, 0x46, 0x6d, 0x28, 0x57, 0x32, 0x40, 0xd0, 0x57, 0xf2, 0x53, 0x52,
];
/// BN254 scalar field modulus, big-endian.
const FR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];
pub const PUBLIC_VALUES_LEN: usize = 32 + 4 + 24 + 24;

#[account]
#[derive(InitSpace)]
pub struct ReportAttestation {
    /// sha256 of the fills dataset the report was computed from.
    pub dataset_sha256: [u8; 32],
    pub fills: u32,
    pub xstock: ReportStats,
    pub prestock: ReportStats,
    pub attester: Pubkey,
    pub slot: u64,
    pub unix_timestamp: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct ReportStats {
    pub graded: u32,
    pub volume_usd_e6: u64,
    pub median_gap_bps: i32,
    pub p90_gap_bps: i32,
    pub within_25bps: u32,
}

#[event]
pub struct ReportVerified {
    pub dataset_sha256: [u8; 32],
    pub fills: u32,
    pub xstock_median_gap_bps: i32,
    pub prestock_median_gap_bps: i32,
}

#[derive(Accounts)]
#[instruction(pi_a: [u8; 64], pi_b: [u8; 128], pi_c: [u8; 64], nonce: [u8; 32], public_values: Vec<u8>)]
pub struct AttestReport<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + ReportAttestation::INIT_SPACE,
        seeds = [b"report", &public_values[..32]],
        bump,
    )]
    pub attestation: Account<'info, ReportAttestation>,
    pub system_program: Program<'info, System>,
}

fn below_modulus(x: &[u8; 32]) -> bool {
    x < &FR_MODULUS // big-endian byte order compares numerically
}

/// Groth16 check: e(-A, B) · e(vk_x, γ) · e(C, δ) · e(α, β) = 1, where `pi_a` is already negated.
pub fn verify_groth16(pi_a: &[u8; 64], pi_b: &[u8; 128], pi_c: &[u8; 64], inputs: &[[u8; 32]; 5]) -> Result<()> {
    let mut vk_x = IC[0].to_vec();
    for (i, input) in inputs.iter().enumerate() {
        require!(below_modulus(input), GuardError::ProofInvalid);
        let mul = alt_bn128_multiplication(&[&IC[i + 1][..], &input[..]].concat()).map_err(|_| GuardError::ProofInvalid)?;
        vk_x = alt_bn128_addition(&[&vk_x[..], &mul[..]].concat()).map_err(|_| GuardError::ProofInvalid)?;
    }
    let pairing_input = [
        &pi_a[..], &pi_b[..],
        &vk_x[..], &GAMMA_G2[..],
        &pi_c[..], &DELTA_G2[..],
        &ALPHA_G1[..], &BETA_G2[..],
    ].concat();
    let out = alt_bn128_pairing(&pairing_input).map_err(|_| GuardError::ProofInvalid)?;
    require!(out.len() == 32 && out[31] == 1 && out[..31].iter().all(|b| *b == 0), GuardError::ProofInvalid);
    Ok(())
}

fn stats(b: &[u8]) -> ReportStats {
    ReportStats {
        graded: u32::from_le_bytes(b[0..4].try_into().unwrap()),
        volume_usd_e6: u64::from_le_bytes(b[4..12].try_into().unwrap()),
        median_gap_bps: i32::from_le_bytes(b[12..16].try_into().unwrap()),
        p90_gap_bps: i32::from_le_bytes(b[16..20].try_into().unwrap()),
        within_25bps: u32::from_le_bytes(b[20..24].try_into().unwrap()),
    }
}

pub fn attest(ctx: Context<AttestReport>, pi_a: [u8; 64], pi_b: [u8; 128], pi_c: [u8; 64], nonce: [u8; 32], public_values: Vec<u8>) -> Result<()> {
    require!(public_values.len() == PUBLIC_VALUES_LEN, GuardError::ProofInvalid);
    let mut committed = hashv(&[&public_values]).to_bytes();
    committed[0] &= 0x1f; // SP1 masks the digest into the 254-bit field
    // exit code must be zero: a successful run of the report program
    let inputs = [REPORT_PROGRAM_VKEY_HASH, committed, [0u8; 32], VK_ROOT, nonce];
    verify_groth16(&pi_a, &pi_b, &pi_c, &inputs)?;

    let clock = Clock::get()?;
    let a = &mut ctx.accounts.attestation;
    a.dataset_sha256 = public_values[..32].try_into().unwrap();
    a.fills = u32::from_le_bytes(public_values[32..36].try_into().unwrap());
    a.xstock = stats(&public_values[36..60]);
    a.prestock = stats(&public_values[60..84]);
    a.attester = ctx.accounts.payer.key();
    a.slot = clock.slot;
    a.unix_timestamp = clock.unix_timestamp;
    a.bump = ctx.bumps.attestation;
    emit!(ReportVerified {
        dataset_sha256: a.dataset_sha256,
        fills: a.fills,
        xstock_median_gap_bps: a.xstock.median_gap_bps,
        prestock_median_gap_bps: a.prestock.median_gap_bps,
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn h(s: &str) -> Vec<u8> { hex::decode(s).unwrap() }

    /// The committed proof in zk/proof verifies with the same code the program runs on-chain
    /// (solana-bn254 uses arkworks off-chain and the alt_bn128 syscalls on-chain).
    #[test]
    fn committed_proof_verifies_and_tampering_fails() {
        let j: serde_json::Value = serde_json::from_str(include_str!("../../../../zk/proof/solana.json")).unwrap();
        let g = |k: &str| h(j[k].as_str().unwrap());
        let (pi_a, pi_b, pi_c, nonce, pv) = (g("pi_a"), g("pi_b"), g("pi_c"), g("nonce"), g("public_values"));
        let mut committed = hashv(&[&pv]).to_bytes();
        committed[0] &= 0x1f;
        let inputs = [REPORT_PROGRAM_VKEY_HASH, committed, [0u8; 32], VK_ROOT, nonce.clone().try_into().unwrap()];
        let a: [u8; 64] = pi_a.clone().try_into().unwrap();
        let b: [u8; 128] = pi_b.try_into().unwrap();
        let c: [u8; 64] = pi_c.try_into().unwrap();
        assert!(verify_groth16(&a, &b, &c, &inputs).is_ok());

        // Change one committed number: the proof no longer matches.
        let mut bad = pv.clone();
        bad[40] ^= 1;
        let mut bad_committed = hashv(&[&bad]).to_bytes();
        bad_committed[0] &= 0x1f;
        let bad_inputs = [REPORT_PROGRAM_VKEY_HASH, bad_committed, [0u8; 32], VK_ROOT, nonce.try_into().unwrap()];
        assert!(verify_groth16(&a, &b, &c, &bad_inputs).is_err());
    }
}
