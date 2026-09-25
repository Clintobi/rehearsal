//! Proves the execution report and writes everything the Solana verifier needs.
//!   cargo run --release -- --execute   (fast check, no proof)
//!   cargo run --release                (Groth16 proof; needs Docker and ~16 GB+ RAM, or SP1_PROVER=network)
use sp1_sdk::{include_elf, HashableKey, ProverClient, SP1Stdin};

const ELF: &[u8] = include_elf!("rehearsal-report-program");

fn main() {
    let data = std::fs::read("../data/fills.json").expect("zk/data/fills.json");
    let mut stdin = SP1Stdin::new();
    stdin.write_vec(data);
    let client = ProverClient::from_env();

    let (public_values, report) = client.execute(ELF, &stdin).run().expect("execute");
    println!("executed: {} cycles", report.total_instruction_count());
    println!("public values: {}", hex::encode(public_values.as_slice()));
    std::fs::create_dir_all("../out").unwrap();
    std::fs::write("../out/public_values.hex", hex::encode(public_values.as_slice())).unwrap();
    if std::env::args().any(|a| a == "--execute") {
        return;
    }

    let (pk, vk) = client.setup(ELF);
    let proof = client.prove(&pk, &stdin).groth16().run().expect("prove");
    client.verify(&proof, &vk).expect("verify");
    std::fs::write("../out/groth16_proof.hex", hex::encode(proof.bytes())).unwrap();
    std::fs::write("../out/vkey_hash.txt", vk.bytes32()).unwrap();
    proof.save("../out/proof.bin").unwrap();
    println!("vkey hash: {}", vk.bytes32());
    println!("proof written to zk/out/");
}
