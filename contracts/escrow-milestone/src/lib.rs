#![no_std]

//! Escrow Milestone Release Contract — Closes #314
//!
//! Flow:
//!   1. Funder deposits XLM/token into escrow via `deposit()`
//!   2. Verifier (oracle/admin) calls `verify_milestone()` after GPS + photo check
//!   3. Contract instantly releases 75% to the farmer's Stellar wallet
//!   4. Remaining 25% stays locked until final milestone or dispute resolution

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Bytes, Env, IntoVal, Symbol,
};

const MILESTONE_1_BPS: i128 = 7_500;
const BPS_DENOM: i128       = 10_000;

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
    pub farmer:        Address,
    pub funder:        Address,
    pub token:         Address,
    pub total_amount:  i128,
    pub released:      i128,
    pub status:        EscrowStatus,
    pub verification_hash: Option<Bytes>,
}

#[contract]
pub struct EscrowMilestone;

#[contractimpl]
impl EscrowMilestone {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
    }

    pub fn deposit(env: Env, funder: Address, farmer: Address, token: Address, amount: i128) {
        funder.require_auth();
        if amount <= 0 { panic!("amount must be positive"); }

        let key = Self::escrow_key(&env, &farmer);
        if env.storage().persistent().has(&key) {
            panic!("active escrow already exists for this farmer");
        }

        token::Client::new(&env, &token)
            .transfer(&funder, &env.current_contract_address(), &amount);

        env.storage().persistent().set(&key, &EscrowState {
            farmer:            farmer.clone(),
            funder:            funder.clone(),
            token:             token.clone(),
            total_amount:      amount,
            released:          0,
            status:            EscrowStatus::Funded,
            verification_hash: OptProof::None,
        });

        env.events().publish(
            (Symbol::new(&env, "DonationReceived"), funder, farmer),
            (amount, token),
        );
    }

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

        let remainder = state.total_amount - state.released;
        if remainder <= 0 { panic!("nothing left to release"); }

        token::Client::new(&env, &state.token)
            .transfer(&env.current_contract_address(), &state.farmer, &remainder);

        state.released += remainder;
        state.status    = EscrowStatus::Completed;

        env.storage().persistent().set(&key, &state);

        env.events().publish(
            (Symbol::new(&env, "MilestonePaymentReleased"), farmer),
            remainder,
        );
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

        env.events().publish(
            (Symbol::new(&env, "DonationRefunded"), state.funder, farmer),
            state.total_amount,
        );
    }

    pub fn get_escrow(env: Env, farmer: Address) -> Option<EscrowState> {
        env.storage().persistent().get(&Self::escrow_key(&env, &farmer))
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
        testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, Ledger},
        token, Address, BytesN, Env,
    };

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();

        let contract = env.register_contract(None, EscrowMilestone);
        let client   = EscrowMilestoneClient::new(&env, &contract);

        let admin  = Address::generate(&env);
        let funder = Address::generate(&env);
        let farmer = Address::generate(&env);

        let token = env.register_stellar_asset_contract(admin.clone());
        token::StellarAssetClient::new(&env, &token).mint(&funder, &10_000);

        client.initialize(&admin);
        Ctx { env, client, token, funder, farmer, contract }
    }

    fn dummy_hash(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[1u8; 32]).into()
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

        // Step 2: Planting verification → 75% released
        client.verify_milestone(&farmer, &dummy_hash(&env));

        assert_eq!(balance(&env, &token, &contract), 2_500, "25% still locked");
        assert_eq!(balance(&env, &token, &farmer),   7_500, "farmer received 75%");

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status,   EscrowStatus::Milestone1Released);
        assert_eq!(state.released, 7_500);
        assert!(state.verification_hash.is_some());

        // Step 3: Survival / final milestone → remaining 25% released
        client.release_remainder(&farmer);

        assert_eq!(balance(&env, &token, &contract), 0,      "contract fully drained");
        assert_eq!(balance(&env, &token, &farmer),   10_000, "farmer received 100%");

        let state = client.get_escrow(&farmer).unwrap();
        assert_eq!(state.status,   EscrowStatus::Completed);
        assert_eq!(state.released, 10_000);
    }

    #[test]
    fn test_tranche_amounts_non_round_deposit() {
        let Ctx { env, client, token, funder, farmer, contract } = setup();
        token::StellarAssetClient::new(&env, &token).mint(&funder, &999);
        client.deposit(&funder, &farmer, &token, &999);

        client.verify_milestone(&farmer, &dummy_hash(&env));
        let tranche1 = (999_i128 * 7_500) / 10_000; // = 749
        assert_eq!(balance(&env, &token, &farmer), tranche1);

        client.release_remainder(&farmer);
        assert_eq!(balance(&env, &token, &farmer),   999);
        assert_eq!(balance(&env, &token, &contract), 0);
    }

    // ── Error paths ───────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "milestone already processed")]
    fn test_double_verify_rejected() {
        let Ctx { env, client, token, funder, farmer, .. } = setup();
        client.deposit(&funder, &farmer, &token, &10_000);
        client.verify_milestone(&farmer, &dummy_hash(&env));
        client.verify_milestone(&farmer, &dummy_hash(&env));
    }

    #[test]
    #[should_panic(expected = "first milestone not yet verified")]
    fn test_release_remainder_before_milestone_rejected() {
        let Ctx { client, token, funder, farmer, .. } = setup();
        client.deposit(&funder, &farmer, &token, &10_000);
        client.release_remainder(&farmer);
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
        client.verify_milestone(&farmer, &dummy_hash(&env));
        client.refund(&farmer);
    }

    // ── Init guard ────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_initialize_twice_rejected() {
        let Ctx { env, client, .. } = setup();
        client.initialize(&Address::generate(&env));
    }
}
