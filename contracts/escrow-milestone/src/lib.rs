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

        env.storage().persistent().set(&key, &state);

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

    // ── Multi-asset donation tests ────────────────────────────────────────────

    fn make_token(env: &Env, admin: &Address, recipient: &Address, amount: i128) -> Address {
        let token = env.register_stellar_asset_contract(admin.clone());
        token::StellarAssetClient::new(env, &token).mint(recipient, &amount);
        token
    }

    #[test]
    fn test_xlm_donation_full_lifecycle() {
        let Ctx { env, client, token: xlm, funder, farmer, contract } = setup();

        client.deposit(&funder, &farmer, &xlm, &10_000);
        assert_eq!(client.get_escrow(&farmer).unwrap().token, xlm);

        client.verify_milestone(&farmer, &dummy_hash(&env));
        assert_eq!(balance(&env, &xlm, &farmer),   7_500);
        assert_eq!(balance(&env, &xlm, &contract), 2_500);

        client.release_remainder(&farmer);
        assert_eq!(balance(&env, &xlm, &farmer),   10_000, "farmer paid 100% in XLM");
        assert_eq!(balance(&env, &xlm, &contract), 0);
    }

    #[test]
    fn test_usdc_donation_full_lifecycle() {
        let env = Env::default();
        env.mock_all_auths();

        let admin  = Address::generate(&env);
        let funder = Address::generate(&env);
        let farmer = Address::generate(&env);

        let contract = env.register_contract(None, EscrowMilestone);
        let client   = EscrowMilestoneClient::new(&env, &contract);
        client.initialize(&admin);

        let usdc = make_token(&env, &admin, &funder, 20_000);
        client.deposit(&funder, &farmer, &usdc, &20_000);

        assert_eq!(client.get_escrow(&farmer).unwrap().token, usdc);

        client.verify_milestone(&farmer, &dummy_hash(&env));
        assert_eq!(balance(&env, &usdc, &farmer),   15_000, "75% of 20_000 in USDC");
        assert_eq!(balance(&env, &usdc, &contract), 5_000);

        client.release_remainder(&farmer);
        assert_eq!(balance(&env, &usdc, &farmer),   20_000, "farmer paid 100% in USDC");
        assert_eq!(balance(&env, &usdc, &contract), 0);
    }

    #[test]
    fn test_mixed_batch_xlm_and_usdc_no_cross_contamination() {
        let env = Env::default();
        env.mock_all_auths();

        let admin    = Address::generate(&env);
        let donor_a  = Address::generate(&env);
        let donor_b  = Address::generate(&env);
        let farmer_a = Address::generate(&env);
        let farmer_b = Address::generate(&env);

        let contract = env.register_contract(None, EscrowMilestone);
        let client   = EscrowMilestoneClient::new(&env, &contract);
        client.initialize(&admin);

        let xlm  = make_token(&env, &admin, &donor_a, 10_000);
        let usdc = make_token(&env, &admin, &donor_b, 8_000);

        client.deposit(&donor_a, &farmer_a, &xlm,  &10_000);
        client.deposit(&donor_b, &farmer_b, &usdc, &8_000);

        assert_eq!(client.get_escrow(&farmer_a).unwrap().token, xlm);
        assert_eq!(client.get_escrow(&farmer_b).unwrap().token, usdc);

        client.verify_milestone(&farmer_a, &dummy_hash(&env));
        client.verify_milestone(&farmer_b, &dummy_hash(&env));

        assert_eq!(balance(&env, &xlm,  &farmer_a), 7_500);
        assert_eq!(balance(&env, &usdc, &farmer_b), 6_000);

        // No cross-asset leakage
        assert_eq!(balance(&env, &usdc, &farmer_a), 0, "farmer_a has no USDC");
        assert_eq!(balance(&env, &xlm,  &farmer_b), 0, "farmer_b has no XLM");

        client.release_remainder(&farmer_a);
        client.release_remainder(&farmer_b);

        assert_eq!(balance(&env, &xlm,  &farmer_a), 10_000);
        assert_eq!(balance(&env, &usdc, &farmer_b), 8_000);
        assert_eq!(balance(&env, &xlm,  &contract), 0);
        assert_eq!(balance(&env, &usdc, &contract), 0);
    }

    #[test]
    fn test_mixed_batch_independent_escrow_accounting() {
        let env = Env::default();
        env.mock_all_auths();

        let admin    = Address::generate(&env);
        let donor    = Address::generate(&env);
        let farmer_a = Address::generate(&env);
        let farmer_b = Address::generate(&env);
        let farmer_c = Address::generate(&env);

        let contract = env.register_contract(None, EscrowMilestone);
        let client   = EscrowMilestoneClient::new(&env, &contract);
        client.initialize(&admin);

        let xlm  = make_token(&env, &admin, &donor, 50_000);
        let usdc = make_token(&env, &admin, &donor, 30_000);

        client.deposit(&donor, &farmer_a, &xlm,  &10_000);
        client.deposit(&donor, &farmer_b, &usdc, &20_000);
        client.deposit(&donor, &farmer_c, &xlm,  &5_000);

        assert_eq!(client.get_escrow(&farmer_a).unwrap().total_amount, 10_000);
        assert_eq!(client.get_escrow(&farmer_b).unwrap().total_amount, 20_000);
        assert_eq!(client.get_escrow(&farmer_c).unwrap().total_amount, 5_000);

        client.verify_milestone(&farmer_a, &dummy_hash(&env));
        client.verify_milestone(&farmer_b, &dummy_hash(&env));
        client.verify_milestone(&farmer_c, &dummy_hash(&env));

        assert_eq!(client.get_escrow(&farmer_a).unwrap().released, 7_500);
        assert_eq!(client.get_escrow(&farmer_b).unwrap().released, 15_000);
        assert_eq!(client.get_escrow(&farmer_c).unwrap().released, 3_750);

        client.release_remainder(&farmer_a);
        client.release_remainder(&farmer_b);
        client.release_remainder(&farmer_c);

        assert_eq!(balance(&env, &xlm,  &farmer_a), 10_000);
        assert_eq!(balance(&env, &usdc, &farmer_b), 20_000);
        assert_eq!(balance(&env, &xlm,  &farmer_c), 5_000);
        assert_eq!(balance(&env, &xlm,  &contract), 0);
        assert_eq!(balance(&env, &usdc, &contract), 0);
    }

    #[test]
    fn test_usdc_refund_returns_usdc_to_funder() {
        let env = Env::default();
        env.mock_all_auths();

        let admin  = Address::generate(&env);
        let funder = Address::generate(&env);
        let farmer = Address::generate(&env);

        let contract = env.register_contract(None, EscrowMilestone);
        let client   = EscrowMilestoneClient::new(&env, &contract);
        client.initialize(&admin);

        let usdc = make_token(&env, &admin, &funder, 5_000);
        client.deposit(&funder, &farmer, &usdc, &5_000);
        assert_eq!(balance(&env, &usdc, &funder), 0);

        client.refund(&farmer);

        assert_eq!(balance(&env, &usdc, &funder),   5_000, "funder refunded in USDC");
        assert_eq!(balance(&env, &usdc, &farmer),   0);
        assert_eq!(balance(&env, &usdc, &contract), 0);
    }

    // ── Init guard ────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_initialize_twice_rejected() {
        let Ctx { env, client, .. } = setup();
        client.initialize(&Address::generate(&env));
    }
}
