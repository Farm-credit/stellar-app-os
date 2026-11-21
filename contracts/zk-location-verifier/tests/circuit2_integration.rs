#![cfg(test)]

//! Integration coverage for the Circuit 2 location-verification flow.
//!
//! Exercises the deployed-client surface end to end: initialization, on-chain
//! BN254 Groth16 verification, boundary-commitment binding and nullifier replay
//! prevention. Coordinates never appear in any invocation argument.

use soroban_sdk::{crypto::bn254::Bn254G1Affine, testutils::Address as _, Address, BytesN, Env};
use zk_location_verifier::{
    groth16, LocationProof, LocationProofInput, ZkLocationError, ZkLocationVerifier,
    ZkLocationVerifierClient,
};

fn setup() -> (Env, Address, ZkLocationVerifierClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, ZkLocationVerifier);
    let client = ZkLocationVerifierClient::new(&env, &id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    (env, admin, client)
}

/// Valid proof for the embedded VK: A = G1, B = G2, C = -G1.
fn valid_proof(env: &Env) -> LocationProof {
    let g1 = Bn254G1Affine::from_array(env, &groth16::G1_GENERATOR);
    LocationProof {
        a: g1.to_bytes(),
        b: BytesN::from_array(env, &groth16::G2_GENERATOR),
        c: (-g1).to_bytes(),
    }
}

fn input(env: &Env, nullifier_seed: u8) -> LocationProofInput {
    LocationProofInput {
        boundary_commitment: groth16::boundary_commitment(env),
        nullifier: BytesN::from_array(env, &[nullifier_seed; 32]),
    }
}

#[test]
fn planting_flow_verifies_proof_once_per_nullifier() {
    let (env, _, client) = setup();
    let first_planter = Address::generate(&env);
    let second_planter = Address::generate(&env);
    let proof = valid_proof(&env);

    // Two distinct planters / nullifiers both succeed.
    let first = input(&env, 1);
    let second = input(&env, 2);
    assert!(client.verify_location_proof(&first_planter, &proof, &first));
    assert!(client.verify_location_proof(&second_planter, &proof, &second));

    assert!(client.is_nullifier_spent(&first.nullifier));
    assert!(client.is_nullifier_spent(&second.nullifier));

    // Replaying the first nullifier — even from a different submitter — fails.
    assert_eq!(
        client.try_verify_location_proof(&second_planter, &proof, &first),
        Err(Ok(ZkLocationError::LocationNullifierAlreadySpent.into()))
    );
}

#[test]
fn planting_flow_rejects_foreign_boundary_and_bad_proof() {
    let (env, _, client) = setup();
    let submitter = Address::generate(&env);
    let proof = valid_proof(&env);

    let mut wrong_boundary = input(&env, 3);
    wrong_boundary.boundary_commitment = BytesN::from_array(&env, &[0xEE; 32]);
    assert_eq!(
        client.try_verify_location_proof(&submitter, &proof, &wrong_boundary),
        Err(Ok(ZkLocationError::BoundaryCommitmentMismatch.into()))
    );
    assert!(!client.is_nullifier_spent(&wrong_boundary.nullifier));

    let mut bad_proof = proof;
    bad_proof.c = bad_proof.a.clone();
    let good_input = input(&env, 4);
    assert_eq!(
        client.try_verify_location_proof(&submitter, &bad_proof, &good_input),
        Err(Ok(ZkLocationError::InvalidLocationProof.into()))
    );
    assert!(!client.is_nullifier_spent(&good_input.nullifier));
}

#[test]
fn verification_key_hash_supports_off_chain_audit() {
    let (env, _, client) = setup();
    let hash = client.get_verification_key_hash();
    assert_ne!(hash, BytesN::from_array(&env, &[0u8; 32]));
    assert_eq!(
        client.get_boundary_commitment(),
        groth16::boundary_commitment(&env)
    );
}
