//! Proves the execution report and writes everything the Solana verifier needs.
//!   cargo run --release -- --execute   fast check, no proof
//!   cargo run --release                Groth16 proof. Local: Docker + 16 GB+ RAM.
//!                                      Or SP1_PROVER=network NETWORK_PRIVATE_KEY=... (Succinct Prover Network)
use sp1_sdk::blocking::{ProveRequest, Prover, ProverClient};
use sp1_sdk::{include_elf, Elf, HashableKey, ProvingKey, SP1Stdin};

const ELF: Elf = include_elf!("rehearsal-report-program");

fn main() {
    let data = std::fs::read("../data/fills.json").expect("zk/data/fills.json");
    let mut stdin = SP1Stdin::new();
    stdin.write_vec(data);
    let client = ProverClient::from_env();

    let (public_values, report) = client.execute(ELF, stdin.clone()).run().expect("execute");
    println!("executed: {} instructions", report.total_instruction_count());
    println!("public values: {}", hex::encode(public_values.as_slice()));
    std::fs::create_dir_all("../out").unwrap();
    std::fs::write("../out/public_values.hex", hex::encode(public_values.as_slice())).unwrap();
    if std::env::args().any(|a| a == "--execute") {
        return;
    }

    let pk = client.setup(ELF).expect("setup");
    let proof = client.prove(&pk, stdin).groth16().run().expect("prove");
    client.verify(&proof, pk.verifying_key(), None).expect("verify");
    let vk = pk.verifying_key().bytes32();
    std::fs::write("../out/groth16_proof.hex", hex::encode(proof.bytes())).unwrap();
    std::fs::write("../out/vkey_hash.txt", &vk).unwrap();
    proof.save("../out/proof.bin").unwrap();
    println!("vkey hash: {vk}");
    println!("proof written to zk/out/");
}
