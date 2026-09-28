#![no_std]

//! Farmer payment escrow for carbon-credit purchases.
//!
//! A buyer's payment is held by this contract rather than sent directly to the
//! farmer. An authorised verifier must attest that the purchased credits were
//! retired or verified. The payment can then be released to the farmer only
//! after the configured verification period. If no attestation arrives before
//! the verification deadline, the buyer can recover the full payment.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, BytesN, Env, IntoVal,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum FarmerEscrowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AmountMustBePositive = 3,
    VerificationWindowMustBePositive = 4,
    EscrowAlreadyExists = 5,
    EscrowNotFound = 6,
    Unauthorized = 7,
    InvalidStatus = 8,
    VerificationDeadlineNotReached = 9,
    VerificationDeadlinePassed = 10,
    ReleasePeriodNotElapsed = 11,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PaymentStatus {
    /// Payment has been received but the credits are not yet verified.
    Held,
    /// Credits are verified/retired; payment remains protected until release.
    Verified,
    Released,
    Refunded,
}

/// Immutable payment terms and the current settlement state for one purchase.
#[contracttype]
#[derive(Clone, Debug)]
pub struct FarmerEscrowRecord {
    pub buyer: Address,
    pub farmer: Address,
    pub payment_token: Address,
    pub amount: i128,
    /// Identifies the carbon-credit purchase without exposing off-chain data.
    pub credit_id: BytesN<32>,
    pub funded_at: u64,
    /// Last timestamp at which the verifier can approve the credits.
    pub verification_deadline: u64,
    /// Timestamp after which anyone may execute the farmer payout.
    pub release_at: u64,
    /// Buyer-selected protection period applied after verification.
    pub release_delay_secs: u64,
    pub verified_at: u64,
    pub verification_proof: BytesN<32>,
    pub status: PaymentStatus,
}

#[contract]
pub struct FarmerEscrow;

#[contractimpl]
impl FarmerEscrow {
    /// Sets the administrator and independent credit verifier once.
    pub fn initialize(env: Env, admin: Address, verifier: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, FarmerEscrowError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("VERIFY"), &verifier);
    }

    /// Rotates the verifier. Only governance can change the settlement oracle.
    pub fn set_verifier(env: Env, verifier: Address) {
        Self::admin(&env).require_auth();
        env.storage()
            .instance()
            .set(&symbol_short!("VERIFY"), &verifier);
    }

    /// Holds a buyer payment for a carbon-credit purchase.
    ///
    /// `verification_window_secs` is the maximum time the buyer waits for a
    /// verifier attestation. `release_delay_secs` is the post-attestation
    /// protection period before funds can be paid to the farmer.
    pub fn fund(
        env: Env,
        buyer: Address,
        farmer: Address,
        payment_token: Address,
        escrow_id: u64,
        credit_id: BytesN<32>,
        amount: i128,
        verification_window_secs: u64,
        release_delay_secs: u64,
    ) {
        buyer.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, FarmerEscrowError::AmountMustBePositive);
        }
        if verification_window_secs == 0 {
            panic_with_error!(&env, FarmerEscrowError::VerificationWindowMustBePositive);
        }

        let key = Self::key(&env, escrow_id);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, FarmerEscrowError::EscrowAlreadyExists);
        }

        let funded_at = env.ledger().timestamp();
        let verification_deadline = funded_at.saturating_add(verification_window_secs);
        token::Client::new(&env, &payment_token).transfer(
            &buyer,
            &env.current_contract_address(),
            &amount,
        );

        env.storage().persistent().set(
            &key,
            &FarmerEscrowRecord {
                buyer: buyer.clone(),
                farmer: farmer.clone(),
                payment_token: payment_token.clone(),
                amount,
                credit_id,
                funded_at,
                verification_deadline,
                release_at: 0,
                release_delay_secs,
                verified_at: 0,
                verification_proof: BytesN::from_array(&env, &[0; 32]),
                status: PaymentStatus::Held,
            },
        );
        env.events().publish(
            (symbol_short!("PayHeld"), escrow_id),
            (buyer, farmer, payment_token, amount, verification_deadline),
        );
    }

    /// Records a verifier's credit-retirement or credit-verification proof.
    pub fn verify_credits(env: Env, escrow_id: u64, verification_proof: BytesN<32>) {
        Self::verifier(&env).require_auth();
        let key = Self::key(&env, escrow_id);
        let mut escrow = Self::record(&env, &key);
        if escrow.status != PaymentStatus::Held {
            panic_with_error!(&env, FarmerEscrowError::InvalidStatus);
        }
        let now = env.ledger().timestamp();
        if now > escrow.verification_deadline {
            panic_with_error!(&env, FarmerEscrowError::VerificationDeadlinePassed);
        }

        escrow.status = PaymentStatus::Verified;
        escrow.verified_at = now;
        escrow.release_at = now.saturating_add(escrow.release_delay_secs);
        escrow.verification_proof = verification_proof;
        env.storage().persistent().set(&key, &escrow);
        env.events().publish(
            (symbol_short!("CredVrf"), escrow_id),
            (escrow.credit_id, escrow.release_at),
        );
    }

    /// Releases a verified payment after the protection period.
    ///
    /// This call is intentionally permissionless: once the on-chain deadline is
    /// satisfied, neither buyer nor verifier can indefinitely withhold payout.
    pub fn release_payment(env: Env, escrow_id: u64) {
        let key = Self::key(&env, escrow_id);
        let mut escrow = Self::record(&env, &key);
        if escrow.status != PaymentStatus::Verified {
            panic_with_error!(&env, FarmerEscrowError::InvalidStatus);
        }
        if env.ledger().timestamp() < escrow.release_at {
            panic_with_error!(&env, FarmerEscrowError::ReleasePeriodNotElapsed);
        }

        // Checks-effects-interactions: settle state before the token call.
        escrow.status = PaymentStatus::Released;
        env.storage().persistent().set(&key, &escrow);
        token::Client::new(&env, &escrow.payment_token).transfer(
            &env.current_contract_address(),
            &escrow.farmer,
            &escrow.amount,
        );
        env.events().publish(
            (symbol_short!("PayRel"), escrow_id),
            (escrow.farmer, escrow.amount),
        );
    }

    /// Returns an unverified payment to its buyer once verification has timed out.
    pub fn refund_unverified(env: Env, escrow_id: u64) {
        let key = Self::key(&env, escrow_id);
        let mut escrow = Self::record(&env, &key);
        escrow.buyer.require_auth();
        if escrow.status != PaymentStatus::Held {
            panic_with_error!(&env, FarmerEscrowError::InvalidStatus);
        }
        if env.ledger().timestamp() <= escrow.verification_deadline {
            panic_with_error!(&env, FarmerEscrowError::VerificationDeadlineNotReached);
        }

        escrow.status = PaymentStatus::Refunded;
        env.storage().persistent().set(&key, &escrow);
        token::Client::new(&env, &escrow.payment_token).transfer(
            &env.current_contract_address(),
            &escrow.buyer,
            &escrow.amount,
        );
        env.events().publish(
            (symbol_short!("PayRef"), escrow_id),
            (escrow.buyer, escrow.amount),
        );
    }

    pub fn get_escrow(env: Env, escrow_id: u64) -> Option<FarmerEscrowRecord> {
        env.storage().persistent().get(&Self::key(&env, escrow_id))
    }

    fn key(env: &Env, escrow_id: u64) -> soroban_sdk::Val {
        (symbol_short!("FESC"), escrow_id).into_val(env)
    }

    fn record(env: &Env, key: &soroban_sdk::Val) -> FarmerEscrowRecord {
        env.storage()
            .persistent()
            .get(key)
            .unwrap_or_else(|| panic_with_error!(env, FarmerEscrowError::EscrowNotFound))
    }

    fn admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, FarmerEscrowError::NotInitialized))
    }

    fn verifier(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("VERIFY"))
            .unwrap_or_else(|| panic_with_error!(env, FarmerEscrowError::NotInitialized))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        token, Address, Env,
    };

    fn setup() -> (
        Env,
        Address,
        Address,
        Address,
        Address,
        FarmerEscrowClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let verifier = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(token_admin)
            .address();
        let contract_id = env.register_contract(None, FarmerEscrow);
        let client = FarmerEscrowClient::new(&env, &contract_id);
        client.initialize(&admin, &verifier);
        (env, verifier, token, contract_id, admin, client)
    }

    fn credit(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[7; 32])
    }

    #[test]
    fn verified_payment_is_released_only_after_the_protection_period() {
        let (env, _, token, contract_id, _, client) = setup();
        let buyer = Address::generate(&env);
        let farmer = Address::generate(&env);
        token::StellarAssetClient::new(&env, &token).mint(&buyer, &500);

        client.fund(&buyer, &farmer, &token, &1, &credit(&env), &500, &100, &50);
        client.verify_credits(&1, &credit(&env));
        assert_eq!(token::Client::new(&env, &token).balance(&contract_id), 500);

        env.ledger().with_mut(|ledger| ledger.timestamp += 50);
        client.release_payment(&1);
        assert_eq!(token::Client::new(&env, &token).balance(&farmer), 500);
        assert_eq!(
            client.get_escrow(&1).unwrap().status,
            PaymentStatus::Released
        );
    }

    #[test]
    fn buyer_can_recover_an_unverified_payment_after_the_deadline() {
        let (env, _, token, contract_id, _, client) = setup();
        let buyer = Address::generate(&env);
        let farmer = Address::generate(&env);
        token::StellarAssetClient::new(&env, &token).mint(&buyer, &500);

        client.fund(&buyer, &farmer, &token, &2, &credit(&env), &500, &10, &0);
        env.ledger().with_mut(|ledger| ledger.timestamp += 11);
        client.refund_unverified(&2);

        assert_eq!(token::Client::new(&env, &token).balance(&buyer), 500);
        assert_eq!(token::Client::new(&env, &token).balance(&contract_id), 0);
        assert_eq!(
            client.get_escrow(&2).unwrap().status,
            PaymentStatus::Refunded
        );
    }
}
