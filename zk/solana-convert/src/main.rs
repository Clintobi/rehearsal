//! Converts zk/proof/* (SP1 v6 Groth16) into Solana alt_bn128 inputs, verifies it off-chain
//! with the same pairing check the on-chain program runs, and writes zk/proof/solana.json.
mod sp1_utils;

use groth16_solana::groth16::{Groth16Verifier, Groth16Verifyingkey};
use sp1_utils::{decode_sp1_vkey_hash, hash_public_inputs, load_groth16_verifying_key_from_bytes, load_proof_from_bytes};

/// SP1 v6.8.1 recursion VK merkle root (sp1-verifier VK_ROOT_BYTES).
const VK_ROOT: [u8; 32] = [
    0x00, 0x2f, 0x85, 0x0e, 0xe9, 0x98, 0x97, 0x4d, 0x6c, 0xc0, 0x0e, 0x50, 0xcd, 0x08, 0x14, 0xb0,
    0x98, 0xc0, 0x5b, 0xfa, 0xde, 0x46, 0x6d, 0x28, 0x57, 0x32, 0x40, 0xd0, 0x57, 0xf2, 0x53, 0x52,
];

fn main() {
    let dir = std::env::args().nth(1).unwrap_or_else(|| "../proof".into());
    let read_hex = |f: &str| hex::decode(std::fs::read_to_string(format!("{dir}/{f}")).unwrap().trim().trim_start_matches("0x")).unwrap();
    let proof = read_hex("groth16_proof.hex");
    let public_values = read_hex("public_values.hex");
    let vkey_hash_str = std::fs::read_to_string(format!("{dir}/vkey_hash.txt")).unwrap().trim().to_string();
    let vk_bytes = std::fs::read(format!("{dir}/groth16_vk_sp1_v6.bin")).unwrap();

    // v6 proof layout: vk hash prefix (4) | exit code (32) | vk root (32) | nonce (32) | gnark proof (256)
    use sha2::{Digest, Sha256};
    assert_eq!(&Sha256::digest(&vk_bytes)[..4], &proof[..4], "groth16 vk prefix");
    let exit_code: [u8; 32] = proof[4..36].try_into().unwrap();
    let vk_root: [u8; 32] = proof[36..68].try_into().unwrap();
    let nonce: [u8; 32] = proof[68..100].try_into().unwrap();
    assert_eq!(exit_code, [0u8; 32], "exit code must be 0");
    assert_eq!(vk_root, VK_ROOT, "vk root must match SP1 v6.8.1");

    let p = load_proof_from_bytes(&proof[100..]).unwrap();
    let vk = load_groth16_verifying_key_from_bytes(&vk_bytes).unwrap();
    let vkey_hash = decode_sp1_vkey_hash(&vkey_hash_str).unwrap();
    let inputs: [[u8; 32]; 5] = [vkey_hash, hash_public_inputs(&public_values), exit_code, vk_root, nonce];

    let gvk = Groth16Verifyingkey {
        nr_pubinputs: vk.vk_ic.len(),
        vk_alpha_g1: vk.vk_alpha_g1,
        vk_beta_g2: vk.vk_beta_g2,
        vk_gamme_g2: vk.vk_gamma_g2,
        vk_delta_g2: vk.vk_delta_g2,
        vk_ic: vk.vk_ic.as_slice(),
    };
    let mut v = Groth16Verifier::new(&p.pi_a, &p.pi_b, &p.pi_c, &inputs, &gvk).expect("verifier");
    v.verify().expect("OFF-CHAIN GROTH16 VERIFICATION FAILED");
    println!("off-chain Groth16 verification: OK ({} IC points)", vk.vk_ic.len());

    let h = |b: &[u8]| hex::encode(b);
    let json = format!(
        "{{\n  \"pi_a\": \"{}\",\n  \"pi_b\": \"{}\",\n  \"pi_c\": \"{}\",\n  \"nonce\": \"{}\",\n  \"public_values\": \"{}\",\n  \"vkey_hash\": \"{}\",\n  \"vk\": {{\n    \"alpha_g1\": \"{}\",\n    \"beta_g2\": \"{}\",\n    \"gamma_g2\": \"{}\",\n    \"delta_g2\": \"{}\",\n    \"ic\": [{}]\n  }}\n}}\n",
        h(&p.pi_a), h(&p.pi_b), h(&p.pi_c), h(&nonce), h(&public_values), h(&vkey_hash),
        h(&vk.vk_alpha_g1), h(&vk.vk_beta_g2), h(&vk.vk_gamma_g2), h(&vk.vk_delta_g2),
        vk.vk_ic.iter().map(|x| format!("\"{}\"", h(x))).collect::<Vec<_>>().join(", ")
    );
    std::fs::write(format!("{dir}/solana.json"), json).unwrap();
    println!("wrote {dir}/solana.json");
}
