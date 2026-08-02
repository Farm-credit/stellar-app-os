#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, crypto, symbol_short, Address, Bytes, BytesN,
    Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The contract has already been initialized.
    AlreadyInitialized = 1,
    /// The caller is not authorized to perform this operation.
    NotAuthorized = 2,
    /// The proof verification failed.
    VerificationFailed = 3,
    /// The number of public inputs does not match the verification key.
    InvalidInputsLength = 4,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    VerificationKey,
}

/// Represents the verification key for the Groth16 proof system.
/// These are points on the G1 and G2 curves.
/// G1 points are 64 bytes (uncompressed), G2 points are 128 bytes (uncompressed).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct VerificationKey {
    pub alpha_g1: BytesN<64>,
    pub beta_g2: BytesN<128>,
    pub gamma_g2: BytesN<128>,
    pub delta_g2: BytesN<128>,
    pub ic: Vec<BytesN<64>>, // G1 points
}

/// Represents a Groth16 proof.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Proof {
    pub a: BytesN<64>,  // G1 point
    pub b: BytesN<128>, // G2 point
    pub c: BytesN<64>,  // G1 point
}

#[contract]
pub struct ZkVerifier;

#[contractimpl]
impl ZkVerifier {
    /// Initializes the contract with an admin and a verification key.
    ///
    /// # Arguments
    /// * `admin` - The address of the admin for this contract.
    /// * `vk` - The verification key required to verify proofs.
    ///
    /// # Panics
    /// Panics if the contract has already been initialized.
    pub fn initialize(env: Env, admin: Address, vk: VerificationKey) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::VerificationKey, &vk);

        // Set a TTL for the instance data to prevent expiration.
        // Extend by 100 ledgers, which is ~8.3 minutes.
        env.storage().instance().extend_ttl(100, 100);
        Ok(())
    }

    /// Verifies a Groth16 proof given the proof and public inputs.
    ///
    /// This function uses the `alt_bn128_pairing_check` host function for efficient
    /// pairing checks, which is the core of Groth16 verification.
    ///
    /// The pairing equation is: e(A, B) = e(alpha, beta) * e(C, delta) * e(sum_inputs, gamma)
    ///
    /// # Arguments
    /// * `proof` - The Groth16 proof to verify.
    /// * `public_inputs` - The public inputs associated with the proof.
    ///
    /// # Returns
    /// Returns `Ok(true)` if the proof is valid, otherwise returns an error.
    pub fn verify_proof(
        env: Env,
        proof: Proof,
        public_inputs: Vec<BytesN<32>>,
    ) -> Result<bool, Error> {
        // Extend the TTL on every call to keep the contract alive.
        env.storage().instance().extend_ttl(100, 100);

        let vk: VerificationKey = env.storage()
            .instance()
            .get(&DataKey::VerificationKey)
            .expect("Verification key not initialized");

        if vk.ic.len() != public_inputs.len() + 1 {
            return Err(Error::InvalidInputsLength);
        }

        // Calculate the sum of public inputs multiplied by their corresponding IC points.
        // This is Σ(input * IC[i+1]) + IC[0]
        let mut pks: Vec<Bytes> = Vec::new(&env);
        pks.push_back(vk.ic.get(0).expect("IC must have at least one element").into());

        for i in 0..public_inputs.len() {
            pks.push_back(
                env.crypto()
                    .alt_bn128_g1_mul(&vk.ic.get(i + 1).expect("IC length mismatch"), &public_inputs.get(i).expect("Inputs length mismatch")),
            );
        }
        let sum_inputs = env.crypto().alt_bn128_g1_sum(pks);

        // The pairing check requires a list of (G1, G2) point pairs.
        // We check if e(A, B) * e(alpha, beta)^-1 * e(C, delta)^-1 * e(sum_inputs, gamma)^-1 == 1
        // The host function takes pairs and checks if the product of pairings is 1.
        // We achieve the inverse by negating the G1 point.
        let alpha_g1_neg = env.crypto().alt_bn128_g1_neg(&vk.alpha_g1);
        let c_neg = env.crypto().alt_bn128_g1_neg(&proof.c);
        let sum_inputs_neg = env.crypto().alt_bn128_g1_neg(&sum_inputs);

        let mut pairs: Vec<(Bytes, Bytes)> = Vec::new(&env);
        pairs.push_back((proof.a.into(), proof.b.into()));
        pairs.push_back((alpha_g1_neg, vk.beta_g2.into()));
        pairs.push_back((c_neg, vk.delta_g2.into()));
        pairs.push_back((sum_inputs_neg, vk.gamma_g2.into()));

        match env.crypto().alt_bn128_pairing_check(pairs) {
            Ok(true) => Ok(true),
            _ => Err(Error::VerificationFailed),
        }
    }

    /// Updates the verification key. Requires admin authorization.
    ///
    /// # Arguments
    /// * `new_vk` - The new verification key.
    pub fn update_vk(env: Env, new_vk: VerificationKey) -> Result<(), Error> {
        let admin: Address = env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not initialized");
        admin.require_auth();

        env.storage().instance().set(&DataKey::VerificationKey, &new_vk);
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, MockAuth, MockAuthInvoke},
        vec, BytesN, Env,
    };

    // Helper to create a dummy G1 point (64 bytes)
    fn g1_point(env: &Env, seed: u8) -> BytesN<64> {
        BytesN::from_array(env, &[seed; 64])
    }

    // Helper to create a dummy G2 point (128 bytes)
    fn g2_point(env: &Env, seed: u8) -> BytesN<128> {
        BytesN::from_array(env, &[seed; 128])
    }

    // Helper to create a dummy public input (32 bytes)
    fn input(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    fn setup_contract() -> (Env, ZkVerifierClient) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ZkVerifier);
        let client = ZkVerifierClient::new(&env, &contract_id);
        (env, client)
    }

    fn get_mock_vk(env: &Env) -> VerificationKey {
        VerificationKey {
            alpha_g1: g1_point(env, 1),
            beta_g2: g2_point(env, 2),
            gamma_g2: g2_point(env, 3),
            delta_g2: g2_point(env, 4),
            ic: vec![&env, g1_point(env, 5), g1_point(env, 6)], // For 1 public input
        }
    }

    fn get_mock_proof(env: &Env) -> Proof {
        Proof {
            a: g1_point(env, 10),
            b: g2_point(env, 11),
            c: g1_point(env, 12),
        }
    }

    #[test]
    fn test_initialize() {
        let (env, client) = setup_contract();
        let admin = Address::random(&env);
        let vk = get_mock_vk(&env);

        client.initialize(&admin, &vk);

        // Verify initialization
        let stored_vk: VerificationKey = env.storage().instance().get(&DataKey::VerificationKey).expect("VK not set");
        assert_eq!(stored_vk, vk);

        // Test re-initialization fails
        let result = client.try_initialize(&admin, &vk);
        assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));
    }

    #[test]
    fn test_verify_proof_success() {
        let (env, client) = setup_contract();
        let admin = Address::random(&env);
        let vk = get_mock_vk(&env);
        client.initialize(&admin, &vk);

        let proof = get_mock_proof(&env);
        let public_inputs = vec![&env, input(&env, 20)];

        // Mock the crypto host functions to simulate a successful verification
        env.crypto().mock_alt_bn128_pairing_check(
            &vec![
                &env,
                (proof.a.clone().into(), proof.b.clone().into()),
                (env.crypto().alt_bn128_g1_neg(&vk.alpha_g1), vk.beta_g2.clone().into()),
                (env.crypto().alt_bn128_g1_neg(&proof.c), vk.delta_g2.clone().into()),
                (
                    env.crypto().alt_bn128_g1_neg(&env.crypto().alt_bn128_g1_sum(vec![
                        &env,
                        vk.ic.get(0).expect("IC missing").into(),
                        env.crypto().alt_bn128_g1_mul(
                            &vk.ic.get(1).expect("IC missing"),
                            &public_inputs.get(0).expect("Input missing")
                        ),
                    ])),
                    vk.gamma_g2.clone().into(),
                ),
            ],
            &Ok(true),
        );

        let result = client.verify_proof(&proof, &public_inputs);
        assert_eq!(result, Ok(true));
    }

    #[test]
    fn test_verify_proof_failure() {
        let (env, client) = setup_contract();
        let admin = Address::random(&env);
        let vk = get_mock_vk(&env);
        client.initialize(&admin, &vk);

        let proof = get_mock_proof(&env);
        let public_inputs = vec![&env, input(&env, 20)];

        // Mock the crypto host function to simulate failure
        env.crypto().mock_alt_bn128_pairing_check(
            &vec![&env], // In mock mode, we can often use a generic vec
            &Err(soroban_sdk::xdr::ScError::Crypto,
        ));

        let result = client.try_verify_proof(&proof, &public_inputs);
        assert_eq!(result, Err(Ok(Error::VerificationFailed)));
    }

    #[test]
    fn test_invalid_inputs_length() {
        let (env, client) = setup_contract();
        let admin = Address::random(&env);
        let vk = get_mock_vk(&env); // Expects 1 public input
        client.initialize(&admin, &vk);

        let proof = get_mock_proof(&env);
        let public_inputs = vec![&env, input(&env, 20), input(&env, 21)]; // Providing 2

        let result = client.try_verify_proof(&proof, &public_inputs);
        assert_eq!(result, Err(Ok(Error::InvalidInputsLength)));
    }

    #[test]
    fn test_update_vk() {
        let (env, client) = setup_contract();
        let admin = Address::random(&env);
        let vk = get_mock_vk(&env);
        client.initialize(&admin, &vk);

        let new_vk = VerificationKey {
            alpha_g1: g1_point(&env, 101),
            ..vk
        };

        client.mock_auths(&[MockAuth {
            addr: &admin,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "update_vk",
                args: (&new_vk,).into_val(&env),
                sub_invokes: &[],
            },
        }]).update_vk(&new_vk);

        let stored_vk: VerificationKey = env.storage().instance().get(&DataKey::VerificationKey).expect("VK not set");
        assert_eq!(stored_vk, new_vk);
    }

    #[test]
    fn test_update_vk_not_authorized() {
        let (env, client) = setup_contract();
        let admin = Address::random(&env);
        let unauthorized = Address::random(&env);
        let vk = get_mock_vk(&env);
        client.initialize(&admin, &vk);

        let new_vk = VerificationKey {
            alpha_g1: g1_point(&env, 101),
            ..vk
        };

        let result = client.mock_auths(&[MockAuth {
            addr: &unauthorized, // Authenticating as the wrong address
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "update_vk",
                args: (&new_vk,).into_val(&env),
                sub_invokes: &[],
            },
        }]).try_update_vk(&new_vk);

        // The direct error from require_auth is a `HostError`, which we can check for.
        assert!(result.is_err());
    }
}