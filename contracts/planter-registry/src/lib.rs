#![no_std]

//! Planter Registry Contract — Closes #459
//!
//! Planters must register on-chain before accepting jobs.
//! Tracks reputation scores that can be incremented (by escrow on successful
//! completion) or slashed (on dispute resolution).  A minimum score threshold
//! can be checked before high-value job acceptance.
//! Planters must also stake a minimum amount of TREE tokens to apply, which can
//! be slashed if their application is proven fraudulent.

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, panic_with_error, symbol_short,
    token, Address, BytesN, Env, IntoVal, String,
};
use harvesta_errors::HarvestaError;
use admin_controls::AdminControlsClient;

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AlreadyRegistered = 3,
    NotRegistered = 4,
    NotAuthorized = 5,
    MinStakeMustBePositive = 6,
    InsufficientStake = 7,
    PlanterNotStaked = 8,
    SlashExceedsStake = 9,
}

// ── Constants ─────────────────────────────────────────────────────────────────

/// Default starting score for a newly registered planter.
const INITIAL_SCORE: u32 = 100;
/// Amount added per successful job completion.
const SCORE_INCREMENT: u32 = 10;
/// Amount removed per dispute resolution against the planter.
const SCORE_SLASH: u32 = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PlanterRecord {
    pub wallet: Address,
    /// SHA-256 hash of the planter's off-chain name / identity document.
    pub name_hash: BytesN<32>,
    /// Region identifier string.
    pub region: String,
    pub score: u32,
    pub registered_at: u64,
    /// Cumulative sapling survival inputs used to derive `score`.
    pub saplings_planted: u32,
    pub saplings_survived: u32,
    pub verifications_passed: u32,
    pub verifications_total: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PlanterStake {
    pub planter: Address,
    pub token: Address,
    pub amount: i128,
    pub staked_at: u64,
    pub slashed: i128,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    /// (admin, stake_token, min_stake_amount)
    Config,
    /// Per-planter stake record
    Stake(Address),
    /// Per-planter record (existing)
    Planter(Address),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct PlanterRegistry;

#[contractimpl]
impl PlanterRegistry {
    /// One-time initialisation — store admin address, stake token, and min stake.
    pub fn initialize(env: Env, admin: Address, stake_token: Address, min_stake_amount: i128) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        if min_stake_amount <= 0 {
            panic_with_error!(&env, Error::MinStakeMustBePositive);
        }
        env.storage()
            .instance()
            .set(&DataKey::Config, &(admin, stake_token, min_stake_amount));
    }

    /// Stake tokens to apply as a planter.
    pub fn stake_to_apply(env: Env, planter: Address, amount: i128) {
        planter.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        let (_, stake_token, min_stake): (Address, Address, i128) = Self::config(&env);

        let key = DataKey::Stake(planter.clone());
        if env.storage().persistent().has(&key) {
            // Top-up: add to existing stake
            let mut rec: PlanterStake = env.storage().persistent().get(&key).unwrap();
            rec.amount += amount;
            token::Client::new(&env, &stake_token).transfer(
                &planter,
                &env.current_contract_address(),
                &amount,
            );
            env.storage().persistent().set(&key, &rec);
        } else {
            // New stake: must meet the minimum
            if amount < min_stake {
                panic_with_error!(&env, Error::InsufficientStake);
            }
            token::Client::new(&env, &stake_token).transfer(
                &planter,
                &env.current_contract_address(),
                &amount,
            );
            env.storage().persistent().set(
                &key,
                &PlanterStake {
                    planter: planter.clone(),
                    token: stake_token,
                    amount,
                    staked_at: env.ledger().timestamp(),
                    slashed: 0,
                },
            );
        }

        env.events()
            .publish((symbol_short!("staked"), planter), amount);
    }

    /// Unstake remaining tokens and exit as planter.
    pub fn unstake(env: Env, planter: Address) {
        planter.require_auth();

        let key = DataKey::Stake(planter.clone());
        let rec: PlanterStake = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PlanterNotStaked));

        let amount = rec.amount;
        if amount > 0 {
            token::Client::new(&env, &rec.token).transfer(
                &env.current_contract_address(),
                &planter,
                &amount,
            );
        }

        env.storage().persistent().remove(&key);

        env.events()
            .publish((symbol_short!("unstaked"), planter), amount);
    }

    /// Admin slashes stake from a planter on proven fraud.
    pub fn slash_stake(env: Env, planter: Address, slash_amount: i128) {
        let (admin, _, _) = Self::config(&env);
        admin.require_auth();

        if slash_amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        let key = DataKey::Stake(planter.clone());
        let mut rec: PlanterStake = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::PlanterNotStaked));

        if slash_amount > rec.amount {
            panic_with_error!(&env, Error::SlashExceedsStake);
        }

        rec.amount -= slash_amount;
        rec.slashed += slash_amount;
        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("slashed"), planter), slash_amount);
    }

    /// Returns true if the planter has a stake ≥ min_stake_amount.
    pub fn is_eligible(env: Env, planter: Address) -> bool {
        let (_, _, min_stake) = Self::config(&env);
        env.storage()
            .persistent()
            .get::<DataKey, PlanterStake>(&DataKey::Stake(planter))
            .map(|r| r.amount >= min_stake)
            .unwrap_or(false)
    }

    /// Returns the stake record for a planter, or None.
    pub fn get_stake(env: Env, planter: Address) -> Option<PlanterStake> {
        env.storage()
            .persistent()
            .get(&DataKey::Stake(planter))
    }

    /// Returns the configured minimum stake amount.
    pub fn get_min_stake(env: Env) -> i128 {
        let (_, _, min_stake) = Self::config(&env);
        min_stake
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .persistent()
            .get::<DataKey, PlanterStake>(&DataKey::Stake(planter))
            .map(|r| r.amount >= min_stake)
            .unwrap_or(false)
    }

    /// Returns the stake record for a planter, or None.
    pub fn get_stake(env: Env, planter: Address) -> Option<PlanterStake> {
        env.storage()
            .persistent()
            .get(&DataKey::Stake(planter))
    }

    /// Returns the configured minimum stake amount.
    pub fn get_min_stake(env: Env) -> i128 {
        let (_, _, min_stake) = Self::config(&env);
        min_stake
    }

    /// Register a new planter.
    ///
    /// The wallet must sign the transaction and must have staked the minimum
    /// required tokens.  Starting score is `INITIAL_SCORE`.
    pub fn register_planter(
        env: Env,
        wallet: Address,
        name_hash: BytesN<32>,
        region: String,
    ) -> PlanterRecord {
        Self::assert_not_paused(&env);
        wallet.require_auth();

        if !Self::is_eligible(env.clone(), wallet.clone()) {
            panic_with_error!(&env, Error::InsufficientStake);
        }

        if env
            .storage()
            .persistent()
            .has(&DataKey::Planter(wallet.clone()))
        {
            panic_with_error!(&env, Error::AlreadyRegistered);
        }

        let record = PlanterRecord {
            wallet: wallet.clone(),
            name_hash,
            region,
            score: INITIAL_SCORE,
            registered_at: env.ledger().timestamp(),
            saplings_planted: 0,
            saplings_survived: 0,
            verifications_passed: 0,
            verifications_total: 0,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Planter(wallet.clone()), &record);

        env.events().publish(
            (symbol_short!("PlantReg"), wallet.clone()),
            record.clone(),
        );

        record
    }

    /// Return the planter record for `wallet`, or `None` if not registered.
    pub fn get_planter(env: Env, wallet: Address) -> Option<PlanterRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::Planter(wallet))
    }

    /// Increment the planter's score by `SCORE_INCREMENT`.
    ///
    /// Only callable by the contract admin (typically the escrow contract).
    pub fn increment_score(env: Env, wallet: Address) {
        Self::assert_not_paused(&env);
        Self::require_admin(&env);

        let key = DataKey::Planter(wallet.clone());
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        record.score = record.score.saturating_add(SCORE_INCREMENT);
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("ScoreInc"), wallet.clone()),
            record.score,
        );
    }

    /// Slash the planter's score by `SCORE_SLASH`.
    ///
    /// Only callable by the contract admin (typically the dispute-resolver).
    /// Score floor is 0 — will not underflow.
    pub fn slash_score(env: Env, wallet: Address) {
        Self::assert_not_paused(&env);
        Self::require_admin(&env);

        let key = DataKey::Planter(wallet.clone());
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        record.score = record.score.saturating_sub(SCORE_SLASH);
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("ScoreSls"), wallet.clone()),
            record.score,
        );
    }

    /// Record a batch of sapling survival and oracle verification data, then
    /// recompute the planter's reputation score from cumulative history.
    ///
    /// Score (0–100) is weighted: survival rate contributes 70 points and
    /// verification success rate contributes 30 points.
    ///
    /// Only callable by the contract admin.
    pub fn record_outcome(
        env: Env,
        wallet: Address,
        new_planted: u32,
        new_survived: u32,
        verif_passed: u32,
        verif_total: u32,
    ) {
        Self::assert_not_paused(&env);
        Self::require_admin(&env);

        let key = Self::planter_key(&env, &wallet);
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        record.saplings_planted = record.saplings_planted.saturating_add(new_planted);
        record.saplings_survived = record.saplings_survived.saturating_add(new_survived);
        record.verifications_passed = record.verifications_passed.saturating_add(verif_passed);
        record.verifications_total = record.verifications_total.saturating_add(verif_total);

        let survival_score = if record.saplings_planted == 0 {
            0u32
        } else {
            record.saplings_survived.saturating_mul(70) / record.saplings_planted
        };

        let verification_score = if record.verifications_total == 0 {
            0u32
        } else {
            record.verifications_passed.saturating_mul(30) / record.verifications_total
        };

        record.score = survival_score.saturating_add(verification_score);
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("ScoreUpd"), wallet.clone()),
            record.score,
        );
    }

    /// Return `true` if `wallet` meets `min_score` — use before high-value job
    /// acceptance.  Returns `false` (does not panic) if the planter is not
    /// registered.
    pub fn meets_min_score(env: Env, wallet: Address, min_score: u32) -> bool {
        match env
            .storage()
            .persistent()
            .get::<_, PlanterRecord>(&DataKey::Planter(wallet))
        {
            Some(record) => record.score >= min_score,
            None => false,
        }
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn config(env: &Env) -> (Address, Address, i128) {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn admin_controls(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("ADMC"))
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn assert_not_paused(env: &Env) {
        let admin_controls_addr = Self::admin_controls(env);
        let admin_controls_client = AdminControlsClient::new(env, &admin_controls_addr);
        admin_controls_client.assert_not_paused();
    }

    fn require_admin(env: &Env) {
        let (admin, _, _) = Self::config(env);
        admin.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env, String};

    struct Ctx {
        env: Env,
        admin: Address,
        planter: Address,
        token: Address,
        client: PlanterRegistryClient<'static>,
    }

    fn setup() -> Ctx {
        setup_with_min(1_000)
    }

    fn setup_with_min(min_stake: i128) -> Ctx {
        let env = Env::default();
        env.mock_all_auths();

        // Deploy admin-controls contract
        let admin_controls_id = env.register_contract(None, admin_controls::AdminControls);
        let admin_controls_client = admin_controls::AdminControlsClient::new(&env, &admin_controls_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        admin_controls_client.initialize(&admin, &oracle);

        let contract_id = env.register_contract(None, PlanterRegistry);
        let client = PlanterRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let planter = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();

        token::StellarAssetClient::new(&env, &token).mint(&planter, &10_000);
        client.initialize(&admin, &token, &min_stake);

        Ctx { env, admin, planter, token, client }
    }

    fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    fn name_hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    // ── initialize ─────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let ctx = setup();
        ctx.client.initialize(&ctx.admin, &ctx.token, &1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_initialize_zero_min_stake_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PlanterRegistry);
        let client = PlanterRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        client.initialize(&admin, &token_id, &0);
    }

    // ── stake_to_apply ─────────────────────────────────────────────────────────

    #[test]
    fn test_stake_transfers_tokens_and_stores_record() {
        let ctx = setup();
        let pre = balance(&ctx.env, &ctx.token, &ctx.planter);
        ctx.client.stake_to_apply(&ctx.planter, &2_000);
        assert_eq!(balance(&ctx.env, &ctx.token, &ctx.planter), pre - 2_000);

        let rec = ctx.client.get_stake(&ctx.planter).unwrap();
        assert_eq!(rec.amount, 2_000);
        assert_eq!(rec.slashed, 0);
        assert_eq!(rec.planter, ctx.planter);
    }

    #[test]
    fn test_topup_adds_to_existing_stake() {
        let ctx = setup();
        ctx.client.stake_to_apply(&ctx.planter, &1_000);
        ctx.client.stake_to_apply(&ctx.planter, &500);

        let rec = ctx.client.get_stake(&ctx.planter).unwrap();
        assert_eq!(rec.amount, 1_500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_stake_below_minimum_rejected() {
        let ctx = setup();
        ctx.client.stake_to_apply(&ctx.planter, &999);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_stake_zero_amount_rejected() {
        let ctx = setup();
        ctx.client.stake_to_apply(&ctx.planter, &0);
    }

    // ── is_eligible ────────────────────────────────────────────────────────────

    #[test]
    fn test_eligible_after_meeting_minimum() {
        let ctx = setup();
        assert!(!ctx.client.is_eligible(&ctx.planter));
        ctx.client.stake_to_apply(&ctx.planter, &1_000);
        assert!(ctx.client.is_eligible(&ctx.planter));
    }

    #[test]
    fn test_not_eligible_after_slash_below_minimum() {
        let ctx = setup();
        ctx.client.stake_to_apply(&ctx.planter, &1_000);
        ctx.client.slash_stake(&ctx.planter, &500);
        assert!(!ctx.client.is_eligible(&ctx.planter));
    }

    // ── slash_stake ─────────────────────────────────────────────────────────────

    #[test]
    fn test_slash_reduces_stake_and_records_slashed() {
        let ctx = setup();
        ctx.client.stake_to_apply(&ctx.planter, &2_000);
        ctx.client.slash_stake(&ctx.planter, &800);

        let rec = ctx.client.get_stake(&ctx.planter).unwrap();
        assert_eq!(rec.amount, 1_200);
        assert_eq!(rec.slashed, 800);
    }

    #[test]
    fn test_slash_full_bond() {
        let ctx = setup();
        ctx.client.stake_to_apply(&ctx.planter, &1_000);
        ctx.client.slash_stake(&ctx.planter, &1_000);

        let rec = ctx.client.get_stake(&ctx.planter).unwrap();
        assert_eq!(rec.amount, 0);
        assert_eq!(rec.slashed, 1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_slash_exceeds_stake_rejected() {
        let ctx = setup();
        ctx.client.stake_to_apply(&ctx.planter, &1_000);
        ctx.client.slash_stake(&ctx.planter, &1_001);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_slash_unstaked_planter_rejected() {
        let ctx = setup();
        let stranger = Address::generate(&ctx.env);
        ctx.client.slash_stake(&stranger, &100);
    }

    // ── unstake ────────────────────────────────────────────────────────────────

    #[test]
    fn test_unstake_returns_tokens_and_removes_record() {
        let ctx = setup();
        let pre = balance(&ctx.env, &ctx.token, &ctx.planter);
        ctx.client.stake_to_apply(&ctx.planter, &2_000);
        ctx.client.unstake(&ctx.planter);

        assert_eq!(balance(&ctx.env, &ctx.token, &ctx.planter), pre);
        assert!(ctx.client.get_stake(&ctx.planter).is_none());
        assert!(!ctx.client.is_eligible(&ctx.planter));
    }

    #[test]
    fn test_unstake_after_partial_slash_returns_remainder() {
        let ctx = setup();
        let pre = balance(&ctx.env, &ctx.token, &ctx.planter);
        ctx.client.stake_to_apply(&ctx.planter, &2_000);
        ctx.client.slash_stake(&ctx.planter, &500);
        ctx.client.unstake(&ctx.planter);

        assert_eq!(balance(&ctx.env, &ctx.token, &ctx.planter), pre - 500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_unstake_without_stake_rejected() {
        let ctx = setup();
        ctx.client.unstake(&ctx.planter);
    }

    // ── register_planter ──────────────────────────────────────────────────────

    #[test]
    fn test_register_and_get() {
        let ctx = setup();
        ctx.client.stake_to_apply(&ctx.planter, &1_000);

        let record = ctx.client.register_planter(
            &ctx.planter,
            &name_hash(&ctx.env, 1),
            &String::from_str(&ctx.env, "s1"),
        );

        assert_eq!(record.wallet, ctx.planter);
        assert_eq!(record.score, INITIAL_SCORE);

        let stored = ctx.client.get_planter(&ctx.planter).unwrap();
        assert_eq!(stored.region, String::from_str(&ctx.env, "s1"));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_register_without_stake_rejected() {
        let ctx = setup();
        ctx.client.register_planter(
            &ctx.planter,
            &name_hash(&ctx.env, 1),
            &String::from_str(&ctx.env, "s1"),
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_double_registration_rejected() {
        let ctx = setup();
        ctx.client.stake_to_apply(&ctx.planter, &1_000);

        ctx.client.register_planter(
            &ctx.planter,
            &name_hash(&ctx.env, 1),
            &String::from_str(&ctx.env, "s1"),
        );
        ctx.client.register_planter(
            &ctx.planter,
            &name_hash(&ctx.env, 2),
            &String::from_str(&ctx.env, "s2"),
        );
    }

    #[test]
    fn test_get_unregistered_returns_none() {
        let ctx = setup();
        assert!(ctx.client.get_planter(&Address::generate(&ctx.env)).is_none());
    }

    // ── increment_score ───────────────────────────────────────────────────────

    #[test]
    fn test_increment_score() {
        let ctx = setup();
        ctx.client.stake_to_apply(&ctx.planter, &1_000);

        ctx.client.register_planter(
            &ctx.planter,
            &name_hash(&ctx.env, 1),
            &String::from_str(&ctx.env, "s1"),
        );
        ctx.client.increment_score(&ctx.planter);

        let record = ctx.client.get_planter(&ctx.planter).unwrap();
        assert_eq!(record.score, INITIAL_SCORE + SCORE_INCREMENT);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_increment_unregistered_panics() {
        let ctx = setup();
        ctx.client.increment_score(&Address::generate(&ctx.env));
    }

    // ── slash_score ───────────────────────────────────────────────────────────

    #[test]
    fn test_slash_score() {
        let ctx = setup();
        ctx.client.stake_to_apply(&ctx.planter, &1_000);

        ctx.client.register_planter(
            &ctx.planter,
            &name_hash(&ctx.env, 1),
            &String::from_str(&ctx.env, "s1"),
        );
        ctx.client.slash_score(&ctx.planter);

        let record = ctx.client.get_planter(&ctx.planter).unwrap();
        assert_eq!(record.score, INITIAL_SCORE - SCORE_SLASH);
    }

    #[test]
    fn test_slash_floors_at_zero() {
        let ctx = setup();
        ctx.client.stake_to_apply(&ctx.planter, &1_000);

        ctx.client.register_planter(
            &ctx.planter,
            &name_hash(&ctx.env, 1),
            &String::from_str(&ctx.env, "s1"),
        );

        // Slash many times to drive score to zero without panicking.
        for _ in 0..20 {
            ctx.client.slash_score(&ctx.planter);
        }

        let record = ctx.client.get_planter(&ctx.planter).unwrap();
        assert_eq!(record.score, 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_slash_unregistered_panics() {
        let ctx = setup();
        ctx.client.slash_score(&Address::generate(&ctx.env));
    }

    // ── meets_min_score ───────────────────────────────────────────────────────

    #[test]
    fn test_meets_min_score_initial() {
        let ctx = setup();
        ctx.client.stake_to_apply(&ctx.planter, &1_000);

        ctx.client.register_planter(
            &ctx.planter,
            &name_hash(&ctx.env, 1),
            &String::from_str(&ctx.env, "s1"),
        );

        assert!(ctx.client.meets_min_score(&ctx.planter, &INITIAL_SCORE));
        assert!(ctx.client.meets_min_score(&ctx.planter, &(INITIAL_SCORE - 1)));
        assert!(!ctx.client.meets_min_score(&ctx.planter, &(INITIAL_SCORE + 1)));
    }

    #[test]
    fn test_meets_min_score_after_slash() {
        let ctx = setup();
        ctx.client.stake_to_apply(&ctx.planter, &1_000);

        ctx.client.register_planter(
            &ctx.planter,
            &name_hash(&ctx.env, 1),
            &String::from_str(&ctx.env, "s1"),
        );
        ctx.client.slash_score(&ctx.planter);

        // Score is now INITIAL_SCORE - SCORE_SLASH
        assert!(!ctx.client.meets_min_score(&ctx.planter, &INITIAL_SCORE));
        assert!(ctx.client.meets_min_score(&ctx.planter, &(INITIAL_SCORE - SCORE_SLASH)));
    }

    #[test]
    fn test_meets_min_score_unregistered_returns_false() {
        let ctx = setup();
        assert!(!ctx.client.meets_min_score(&Address::generate(&ctx.env), &0u32));
    }

    // ── record_outcome ────────────────────────────────────────────────────────

    #[test]
    fn test_record_outcome_perfect_scores_to_100() {
        let (env, _, client) = setup();
        let planter = Address::generate(&env);

        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "s1"));
        // 100 % survival, 100 % verification → 70 + 30 = 100
        client.record_outcome(&planter, &100, &100, &50, &50);

        let record = client.get_planter(&planter).unwrap();
        assert_eq!(record.score, 100);
        assert_eq!(record.saplings_planted, 100);
        assert_eq!(record.saplings_survived, 100);
        assert_eq!(record.verifications_passed, 50);
        assert_eq!(record.verifications_total, 50);
    }

    #[test]
    fn test_record_outcome_partial_rates() {
        let (env, _, client) = setup();
        let planter = Address::generate(&env);

        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "s1"));
        // 50 % survival → 35, 50 % verification → 15, total = 50
        client.record_outcome(&planter, &100, &50, &10, &20);

        let record = client.get_planter(&planter).unwrap();
        assert_eq!(record.score, 50);
    }

    #[test]
    fn test_record_outcome_accumulates_across_batches() {
        let (env, _, client) = setup();
        let planter = Address::generate(&env);

        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "s1"));
        // Batch 1: 100 planted, 50 survived; 10 verif, 10 total
        client.record_outcome(&planter, &100, &50, &10, &10);
        // Batch 2: 100 more planted, 100 survived; 10 verif, 10 total
        // Cumulative: 200 planted, 150 survived (75 %), 20/20 verif (100 %)
        // score = 150*70/200 + 20*30/20 = 52 + 30 = 82
        client.record_outcome(&planter, &100, &100, &10, &10);

        let record = client.get_planter(&planter).unwrap();
        assert_eq!(record.saplings_planted, 200);
        assert_eq!(record.saplings_survived, 150);
        assert_eq!(record.score, 82);
    }

    #[test]
    fn test_record_outcome_zero_verif_total_omits_verification() {
        let (env, _, client) = setup();
        let planter = Address::generate(&env);

        client.register_planter(&planter, &name_hash(&env, 1), &String::from_str(&env, "s1"));
        // No verification data — only survival contributes
        client.record_outcome(&planter, &100, &80, &0, &0);

        let record = client.get_planter(&planter).unwrap();
        // 80 % survival → 56, 0 verification → 0, total = 56
        assert_eq!(record.score, 56);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_record_outcome_unregistered_panics() {
        let (env, _, client) = setup();
        client.record_outcome(&Address::generate(&env), &10, &10, &5, &5);
    }
}
