#![no_std]

//! Escrow Milestone Release Contract — Closes #314
//!
//! Flow:
//!   1. Funder deposits XLM/token into escrow via `deposit()`
//!   2. Verifier (oracle/admin) calls `verify_milestone()` after GPS + photo check
//!   3. Contract instantly releases 75% to the farmer's Stellar wallet
//!   4. After 6 months, verifier confirms survival rate >= 70%
//!   5. Contract releases the remaining 25% to the farmer's Stellar wallet

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, IntoVal,
};

/// Percentage released on first milestone verification (basis points: 7500 = 75%)
const MILESTONE_1_BPS: i128 = 7500;
const BPS_DENOM: i128 = 10_000;
const MIN_SURVIVAL_RATE_PERCENT: u32 = 70;

/// 6 months in seconds (approx 26 weeks)
const SIX_MONTHS_SECS: u64 = 60 * 60 * 24 * 7 * 26;

/// Soroban #[contracttype] does not support Option<BytesN<32>> directly.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OptProof {
    None,
    Some(BytesN<32>),
}

impl OptProof {
    pub fn is_some(&self) -> bool { matches!(self, OptProof::Some(_)) }
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    Funded,
    Milestone1Released,
    Completed,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowState {
    pub farmer: Address,
    pub funder: Address,
    pub token: Address,
    pub total_amount: i128,
    pub released: i128,
    pub status: EscrowStatus,
    pub verification_hash: BytesN<32>,
    pub milestone1_verified_at: u64,
    pub survival_verification_hash: BytesN<32>,
    pub survival_rate_percent: u32,
}

#[contract]
pub struct EscrowMilestone;

#[contractimpl]
impl EscrowMilestone {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
    }

    /// Funder deposits `amount` of `token` into escrow for `farmer`.
    /// Creates a new escrow record keyed by farmer address.
    pub fn deposit(env: Env, funder: Address, farmer: Address, token: Address, amount: i128) {
        funder.require_auth();
        if amount <= 0 { panic!("amount must be positive"); }

        let key = Self::escrow_key(&env, &farmer);
        if env.storage().persistent().has(&key) {
            panic!("active escrow already exists for this farmer");
        }

        token::Client::new(&env, &token)
            .transfer(&funder, &env.current_contract_address(), &amount);

        let empty_hash = BytesN::from_array(&env, &[0; 32]);
        let state = EscrowState {
            farmer: farmer.clone(),
            funder,
            token,
            total_amount: amount,
            released: 0,
            status: EscrowStatus::Funded,
            verification_hash: empty_hash.clone(),
            milestone1_verified_at: 0,
            survival_verification_hash: empty_hash,
            survival_rate_percent: 0,
        };

        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("deposit"), farmer), amount);
    }

    /// Called by the admin/verifier after GPS + photo validation passes.
    /// Releases 75% of escrowed funds instantly to the farmer wallet.
    /// `verification_hash` is the SHA-256 of the submitted GPS + photo proof.
    pub fn verify_milestone(env: Env, farmer: Address, verification_hash: BytesN<32>) {
        Self::require_admin(&env);

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env.storage().persistent()
            .get(&key).expect("no escrow found for farmer");

        if state.status != EscrowStatus::Funded {
            panic!("milestone already processed or escrow not in funded state");
        }

        let release_amount = (state.total_amount * MILESTONE_1_BPS) / BPS_DENOM;

        token::Client::new(&env, &state.token)
            .transfer(&env.current_contract_address(), &state.farmer, &release_amount);

        state.released = release_amount;
        state.status = EscrowStatus::Milestone1Released;
        state.verification_hash = verification_hash.clone();
        state.milestone1_verified_at = env.ledger().timestamp();

        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("m1release"), farmer), release_amount);
    }

    /// Release remaining 25% after 6-month survival milestone.
    ///
    /// The admin/verifier represents the ZK/oracle confirmation layer. Funds
    /// only release when the confirmed survival rate is at least 70%.
    pub fn verify_survival(
        env: Env,
        farmer: Address,
        survival_verification_hash: BytesN<32>,
        survival_rate_percent: u32,
    ) {
        state.released          = release_amount;
        state.status            = EscrowStatus::Milestone1Released;
        state.verification_hash = Some(verification_hash.clone().into());

        env.storage().persistent().set(&key, &state);

        env.events().publish(
            (Symbol::new(&env, "PlantingVerified"), farmer),
            (release_amount, verification_hash),
        );
    }

    pub fn release_remainder(env: Env, farmer: Address) {
        Self::require_admin(&env);

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env.storage().persistent()
            .get(&key).expect("no escrow found for farmer");

        if state.status != EscrowStatus::Milestone1Released {
            panic!("first milestone not yet verified");
        }

        if env.ledger().timestamp() < state.milestone1_verified_at + SIX_MONTHS_SECS {
            panic!("6-month survival period not yet elapsed");
        }

        if survival_rate_percent < MIN_SURVIVAL_RATE_PERCENT {
            panic!("survival rate below minimum");
        }

        let remainder = state.total_amount - state.released;
        if remainder <= 0 { panic!("nothing left to release"); }

        let token_client = token::Client::new(&env, &state.token);
        token_client.transfer(&env.current_contract_address(), &state.farmer, &remainder);

        state.released += remainder;
        state.status = EscrowStatus::Completed;
        state.survival_verification_hash = survival_verification_hash;
        state.survival_rate_percent = survival_rate_percent;

        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("m2release"), farmer), remainder);
    }

    pub fn refund(env: Env, farmer: Address) {
        Self::require_admin(&env);

        let key = Self::escrow_key(&env, &farmer);
        let mut state: EscrowState = env.storage().persistent()
            .get(&key).expect("no escrow found for farmer");

        if state.status != EscrowStatus::Funded {
            panic!("cannot refund after milestone release");
        }

        token::Client::new(&env, &state.token)
            .transfer(&env.current_contract_address(), &state.funder, &state.total_amount);

        state.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &state);

        env.events()
            .publish((symbol_short!("refund"), farmer), state.total_amount);
    }

    pub fn get_escrow(env: Env, farmer: Address) -> Option<EscrowState> {
        env.storage()
            .persistent()
            .get(&Self::escrow_key(&env, &farmer))
    }

    fn escrow_key(env: &Env, farmer: &Address) -> soroban_sdk::Val {
        (symbol_short!("ESCROW"), farmer.clone()).into_val(env)
    }

    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance()
            .get(&symbol_short!("ADMIN"))
            .expect("contract not initialized");
        admin.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token, Address, BytesN, Env,
    };

    fn setup() -> (
        Env,
        Address,
        Address,
        Address,
        Address,
        EscrowMilestoneClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, EscrowMilestone);
        let client = EscrowMilestoneClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let funder = Address::generate(&env);
        let farmer = Address::generate(&env);

        // Deploy a test token
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&funder, &10_000);

        client.initialize(&admin);
        Ctx { env, client, token, funder, farmer, contract }
    }

    fn dummy_hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    // ── Full lifecycle with balance assertions ────────────────────────────────

    #[test]
    fn test_full_lifecycle_with_balances() {
        let Ctx { env, client, token, funder, farmer, contract } = setup();

        // Step 1: Donation → funds locked
        assert_eq!(balance(&env, &token, &funder),   10_000);
        assert_eq!(balance(&env, &token, &contract), 0);
        assert_eq!(balance(&env, &token, &farmer),   0);

        client.deposit(&funder, &farmer, &token, &10_000);

        assert_eq!(balance(&env, &token, &funder),   0,      "funder drained");
        assert_eq!(balance(&env, &token, &contract), 10_000, "contract holds full amount");
        assert_eq!(balance(&env, &token, &farmer),   0,      "farmer not yet paid");

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status,       EscrowStatus::Funded);
        assert_eq!(state.total_amount, 10_000);
        assert_eq!(state.released,     0);

        client.verify_milestone(&farmer, &dummy_hash(&env, 1));

        assert_eq!(balance(&env, &token, &contract), 2_500, "25% still locked");
        assert_eq!(balance(&env, &token, &farmer),   7_500, "farmer received 75%");

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status,   EscrowStatus::Milestone1Released);
        assert_eq!(state.released, 7_500);
        assert_eq!(state.status, EscrowStatus::Milestone1Released);
        assert_eq!(state.milestone1_verified_at, env.ledger().timestamp());
    }

    #[test]
    fn test_verify_survival_releases_remainder() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));

        env.ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &dummy_hash(&env, 2), &70);

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.released, 10_000);
        assert_eq!(state.status, EscrowStatus::Completed);
        assert_eq!(state.survival_verification_hash, dummy_hash(&env, 2));
        assert_eq!(state.survival_rate_percent, 70);
    }

    #[test]
    #[should_panic(expected = "6-month survival period not yet elapsed")]
    fn test_survival_too_early_rejected() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));
        client.verify_survival(&farmer, &dummy_hash(&env, 2), &80);
    }

    #[test]
    #[should_panic(expected = "survival rate below minimum")]
    fn test_survival_below_70_percent_rejected() {
        let (env, _admin, funder, farmer, token, client) = setup();

        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));

        env.ledger()
            .with_mut(|l| l.timestamp += SIX_MONTHS_SECS + 1);
        client.verify_survival(&farmer, &dummy_hash(&env, 2), &69);
    }

    // ── Error paths ───────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "milestone already processed")]
    fn test_double_verify_rejected() {
        let Ctx { env, client, token, funder, farmer, .. } = setup();
        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));
        client.verify_milestone(&farmer, &dummy_hash(&env, 1)); // must panic
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_deposit_zero_rejected() {
        let Ctx { client, token, funder, farmer, .. } = setup();
        client.deposit(&funder, &farmer, &token, &0);
    }

    #[test]
    #[should_panic(expected = "active escrow already exists")]
    fn test_duplicate_deposit_rejected() {
        let Ctx { client, token, funder, farmer, .. } = setup();
        client.deposit(&funder, &farmer, &token, &5_000);
        client.deposit(&funder, &farmer, &token, &5_000);
    }

    // ── Refund paths ──────────────────────────────────────────────────────────

    #[test]
    fn test_refund_before_milestone_restores_funder_balance() {
        let Ctx { env, client, token, funder, farmer, .. } = setup();
        client.deposit(&funder, &farmer, &token, &10_000);
        assert_eq!(balance(&env, &token, &funder), 0);

        client.refund(&farmer);

        assert_eq!(balance(&env, &token, &funder),  10_000, "funder fully refunded");
        assert_eq!(balance(&env, &token, &farmer),  0,      "farmer got nothing");
        assert_eq!(client.get_escrow(&farmer).unwrap().status, EscrowStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "cannot refund after milestone release")]
    fn test_refund_after_milestone_rejected() {
        let Ctx { env, client, token, funder, farmer, .. } = setup();
        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &dummy_hash(&env, 1));
        client.refund(&farmer); // must panic
    }
}
