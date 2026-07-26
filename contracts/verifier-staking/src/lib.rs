#![no_std]

//! Verifier Staking Contract — Closes #806, #491
//!
//! Verifiers must register with a minimum bond to participate in tree-planting
//! verification. A fraudulent verification can be proven on-chain and the
//! bond is slashed (transferred to the contract treasury or burned).
//!
//! # Flow
//!   1. Admin calls `initialize(admin, stake_token, min_stake, ...)`.
//!   2. Verifier calls `register(verifier)` — deposits exactly `min_stake`.
//!   3. Registered verifiers call `stake(verifier, amount)` to top up.
//!   4. Admin or governance calls `slash(verifier, amount)` on proven fraud.
//!   5. Verifier calls `unstake(verifier)` to withdraw and deregister.
//!   6. `is_eligible(verifier)` / `is_registered(verifier)` can be queried.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token, Address, Env,
};
use harvesta_errors::HarvestaError;

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum VerifierStakingError {
    MinStakeMustBePositive = 91,
    VerifierAlreadyStaked = 92,
    VerifierNotStaked = 93,
    SlashExceedsStake = 94,
    InsufficientStake = 95,
    NotRegistered = 96,
    AlreadyRegistered = 97,
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct VerifierStake {
    pub verifier: Address,
    pub token: Address,
    pub amount: i128,
    pub staked_at: u64,
    pub slashed: i128,
    pub slashed_to_buffer_pool: i128,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    /// (admin, stake_token, min_stake_amount, governance_contract, replanting_buffer_pool)
    Config,
    /// Per-verifier stake record
    Stake(Address),
    /// Registration flag — set when verifier deposits min_stake via register()
    Registered(Address),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct VerifierStaking;

#[contractimpl]
impl VerifierStaking {
    /// One-time initialisation.
    ///
    /// * `admin`                     — address authorised to slash bonds
    /// * `stake_token`               — SAC token verifiers must stake
    /// * `min_stake_amount`          — minimum bond in token base units
    /// * `governance_contract`       — governance contract for admin control
    /// * `replanting_buffer_pool`    — address of replanting buffer pool contract
    pub fn initialize(
        env: Env,
        admin: Address,
        stake_token: Address,
        min_stake_amount: i128,
        governance_contract: Address,
        replanting_buffer_pool: Address,
    ) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        if min_stake_amount <= 0 {
            panic_with_error!(&env, VerifierStakingError::MinStakeMustBePositive);
        }
        env.storage()
            .instance()
            .set(&DataKey::Config, &(admin, stake_token, min_stake_amount, governance_contract, replanting_buffer_pool));
    }

    /// Register as an active verifier by depositing the minimum stake.
    ///
    /// Transfers exactly `min_stake_amount` from the verifier to this contract.
    /// Sets the `Registered` flag so other contracts can check auditor status.
    /// A verifier may only register once; call `stake()` to top up after
    /// registration.
    pub fn register(env: Env, verifier: Address) {
        verifier.require_auth();

        let (_, stake_token, min_stake, _, _) = Self::config(&env);

        let reg_key = DataKey::Registered(verifier.clone());
        if env.storage().persistent().has(&reg_key) {
            panic_with_error!(&env, VerifierStakingError::AlreadyRegistered);
        }

        // Transfer minimum stake deposit to contract
        token::Client::new(&env, &stake_token).transfer(
            &verifier,
            &env.current_contract_address(),
            &min_stake,
        );

        // Create initial stake record
        let key = DataKey::Stake(verifier.clone());
        env.storage().persistent().set(
            &key,
            &VerifierStake {
                verifier: verifier.clone(),
                token: stake_token,
                amount: min_stake,
                staked_at: env.ledger().timestamp(),
                slashed: 0,
                slashed_to_buffer_pool: 0,
            },
        );

        // Mark as registered
        env.storage().persistent().set(&reg_key, &true);

        env.events()
            .publish((symbol_short!("registerd"), verifier), min_stake);
    }

    /// Registered verifier tops up their stake with `amount`.
    ///
    /// Panics with `NotRegistered` if the verifier has not called `register()`
    /// first.
    pub fn stake(env: Env, verifier: Address, amount: i128) {
        verifier.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        if !Self::is_registered_raw(&env, &verifier) {
            panic_with_error!(&env, VerifierStakingError::NotRegistered);
        }

        let (_, stake_token, _, _, _) = Self::config(&env);

        let key = DataKey::Stake(verifier.clone());
        let mut rec: VerifierStake = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, VerifierStakingError::VerifierNotStaked));

        rec.amount += amount;

        token::Client::new(&env, &stake_token).transfer(
            &verifier,
            &env.current_contract_address(),
            &amount,
        );

        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("staked"), verifier), amount);
    }

    /// Admin slashes `slash_amount` from a verifier's bond on proven fraud.
    /// Slashed tokens are transferred to the replanting buffer pool contract.
    pub fn slash(env: Env, verifier: Address, slash_amount: i128) {
        let (admin, _, _, _, replanting_buffer_pool) = Self::config(&env);
        admin.require_auth();

        if slash_amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        let key = DataKey::Stake(verifier.clone());
        let mut rec: VerifierStake = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, VerifierStakingError::VerifierNotStaked));

        if slash_amount > rec.amount {
            panic_with_error!(&env, VerifierStakingError::SlashExceedsStake);
        }

        rec.amount -= slash_amount;
        rec.slashed += slash_amount;
        rec.slashed_to_buffer_pool += slash_amount;
        env.storage().persistent().set(&key, &rec);

        if slash_amount > 0 {
            let token = token::Client::new(&env, &rec.token);
            token.transfer(
                &env.current_contract_address(),
                &replanting_buffer_pool,
                &slash_amount,
            );
        }

        env.events()
            .publish((symbol_short!("slashed"), verifier.clone()), slash_amount);
        env.events()
            .publish(
                (symbol_short!("slsh_buf"), verifier),
                slash_amount,
            );
    }

    /// Verifier withdraws their remaining bond, exits the verifier role, and
    /// clears the registration flag.
    pub fn unstake(env: Env, verifier: Address) {
        verifier.require_auth();

        let key = DataKey::Stake(verifier.clone());
        let rec: VerifierStake = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, VerifierStakingError::VerifierNotStaked));

        let amount = rec.amount;
        if amount > 0 {
            token::Client::new(&env, &rec.token).transfer(
                &env.current_contract_address(),
                &verifier,
                &amount,
            );
        }

        env.storage().persistent().remove(&key);
        env.storage()
            .persistent()
            .remove(&DataKey::Registered(verifier.clone()));

        env.events()
            .publish((symbol_short!("unstaked"), verifier), amount);
    }

    /// Returns true if the verifier is registered AND has stake ≥ `min_stake_amount`.
    pub fn is_eligible(env: Env, verifier: Address) -> bool {
        let (_, _, min_stake, _, _) = Self::config(&env);
        if !Self::is_registered_raw(&env, &verifier) {
            return false;
        }
        env.storage()
            .persistent()
            .get::<DataKey, VerifierStake>(&DataKey::Stake(verifier))
            .map(|r| r.amount >= min_stake)
            .unwrap_or(false)
    }

    /// Returns true if the verifier has completed registration.
    pub fn is_registered(env: Env, verifier: Address) -> bool {
        Self::is_registered_raw(&env, &verifier)
    }

    /// Returns the stake record for a verifier, or None.
    pub fn get_stake(env: Env, verifier: Address) -> Option<VerifierStake> {
        env.storage()
            .persistent()
            .get(&DataKey::Stake(verifier))
    }

    /// Returns the total slashed amount transferred to the buffer pool for a verifier.
    pub fn get_slashed_to_buffer_pool(env: Env, verifier: Address) -> i128 {
        let rec: VerifierStake = match env
            .storage()
            .persistent()
            .get(&DataKey::Stake(verifier))
        {
            Some(record) => record,
            None => return 0,
        };
        rec.slashed_to_buffer_pool
    }

    /// Returns the configured minimum stake amount.
    pub fn get_min_stake(env: Env) -> i128 {
        let (_, _, min_stake, _, _) = Self::config(&env);
        min_stake
    }

    /// Returns the governance contract address.
    pub fn get_governance_contract(env: Env) -> Address {
        let (_, _, _, governance_contract, _) = Self::config(&env);
        governance_contract
    }

    /// Returns the replanting buffer pool address.
    pub fn get_replanting_buffer_pool(env: Env) -> Address {
        let (_, _, _, _, replanting_buffer_pool) = Self::config(&env);
        replanting_buffer_pool
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn config(env: &Env) -> (Address, Address, i128, Address, Address) {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
    }

    /// Internal: read the `Registered` flag without the public-function wrapper.
    fn is_registered_raw(env: &Env, verifier: &Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Registered(verifier.clone()))
            .unwrap_or(false)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Address, Env};

    struct Ctx {
        env: Env,
        admin: Address,
        verifier: Address,
        token: Address,
        client: VerifierStakingClient<'static>,
    }

    fn setup() -> Ctx {
        setup_with_min(
            1_000,
            Address::generate(&Env::default()),
            Address::generate(&Env::default()),
        )
    }

    fn setup_with_min(min_stake: i128, governance: Address, buffer_pool: Address) -> Ctx {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, VerifierStaking);
        let client = VerifierStakingClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let verifier = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();

        token::StellarAssetClient::new(&env, &token).mint(&verifier, &10_000);
        client.initialize(&admin, &token, &min_stake, &governance, &buffer_pool);

        Ctx {
            env,
            admin,
            verifier,
            token,
            client,
        }
    }

    fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    // ── initialize ─────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let ctx = setup();
        ctx.client.initialize(
            &ctx.admin,
            &ctx.token,
            &1_000,
            &Address::generate(&ctx.env),
            &Address::generate(&ctx.env),
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #91)")]
    fn test_initialize_zero_min_stake_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, VerifierStaking);
        let client = VerifierStakingClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        client.initialize(
            &admin,
            &token_id,
            &0,
            &Address::generate(&env),
            &Address::generate(&env),
        );
    }

    // ── register ───────────────────────────────────────────────────────────────

    #[test]
    fn test_register_transfers_min_stake_and_sets_flags() {
        let ctx = setup();
        let pre = balance(&ctx.env, &ctx.token, &ctx.verifier);
        let min = ctx.client.get_min_stake();

        assert!(!ctx.client.is_registered(&ctx.verifier));
        assert!(!ctx.client.is_eligible(&ctx.verifier));

        ctx.client.register(&ctx.verifier);

        // Tokens transferred
        assert_eq!(
            balance(&ctx.env, &ctx.token, &ctx.verifier),
            pre - min
        );

        // Registered + eligible
        assert!(ctx.client.is_registered(&ctx.verifier));
        assert!(ctx.client.is_eligible(&ctx.verifier));

        // Stake record created
        let rec = ctx.client.get_stake(&ctx.verifier).unwrap();
        assert_eq!(rec.amount, min);
        assert_eq!(rec.slashed, 0);
        assert_eq!(rec.slashed_to_buffer_pool, 0);
        assert_eq!(rec.verifier, ctx.verifier);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #97)")]
    fn test_double_register_rejected() {
        let ctx = setup();
        ctx.client.register(&ctx.verifier);
        ctx.client.register(&ctx.verifier);
    }

    // ── stake (top-up after registration) ──────────────────────────────────────

    #[test]
    fn test_topup_after_register_adds_to_stake() {
        let ctx = setup();
        ctx.client.register(&ctx.verifier);
        let min = ctx.client.get_min_stake();

        ctx.client.stake(&ctx.verifier, &500);

        let rec = ctx.client.get_stake(&ctx.verifier).unwrap();
        assert_eq!(rec.amount, min + 500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #96)")]
    fn test_stake_without_register_rejected() {
        let ctx = setup();
        ctx.client.stake(&ctx.verifier, &1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_stake_zero_amount_rejected() {
        let ctx = setup();
        ctx.client.register(&ctx.verifier);
        ctx.client.stake(&ctx.verifier, &0);
    }

    // ── is_eligible ────────────────────────────────────────────────────────────

    #[test]
    fn test_eligible_after_registration() {
        let ctx = setup();
        assert!(!ctx.client.is_eligible(&ctx.verifier));
        ctx.client.register(&ctx.verifier);
        assert!(ctx.client.is_eligible(&ctx.verifier));
    }

    #[test]
    fn test_not_eligible_before_registration() {
        let ctx = setup();
        assert!(!ctx.client.is_eligible(&ctx.verifier));
    }

    // ── slash ──────────────────────────────────────────────────────────────────

    #[test]
    fn test_slash_reduces_stake_and_records_slashed() {
        let ctx = setup();
        ctx.client.register(&ctx.verifier);
        ctx.client.stake(&ctx.verifier, &1_000);
        ctx.client.slash(&ctx.verifier, &800);

        let rec = ctx.client.get_stake(&ctx.verifier).unwrap();
        assert_eq!(rec.amount, 1_200); // 1000 + 1000 - 800
        assert_eq!(rec.slashed, 800);
        assert_eq!(rec.slashed_to_buffer_pool, 800);
    }

    #[test]
    fn test_slash_full_bond() {
        let ctx = setup();
        ctx.client.register(&ctx.verifier);
        ctx.client.slash(&ctx.verifier, &1_000);

        let rec = ctx.client.get_stake(&ctx.verifier).unwrap();
        assert_eq!(rec.amount, 0);
        assert_eq!(rec.slashed, 1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #94)")]
    fn test_slash_exceeds_stake_rejected() {
        let ctx = setup();
        ctx.client.register(&ctx.verifier);
        ctx.client.slash(&ctx.verifier, &1_001);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #93)")]
    fn test_slash_unstaked_verifier_rejected() {
        let ctx = setup();
        let stranger = Address::generate(&ctx.env);
        ctx.client.slash(&stranger, &100);
    }

    // ── unstake ────────────────────────────────────────────────────────────────

    #[test]
    fn test_unstake_returns_tokens_and_removes_registration() {
        let ctx = setup();
        let pre = balance(&ctx.env, &ctx.token, &ctx.verifier);
        ctx.client.register(&ctx.verifier);
        ctx.client.unstake(&ctx.verifier);

        assert_eq!(balance(&ctx.env, &ctx.token, &ctx.verifier), pre);
        assert!(ctx.client.get_stake(&ctx.verifier).is_none());
        assert!(!ctx.client.is_registered(&ctx.verifier));
        assert!(!ctx.client.is_eligible(&ctx.verifier));
    }

    #[test]
    fn test_unstake_after_partial_slash_returns_remainder() {
        let ctx = setup();
        let pre = balance(&ctx.env, &ctx.token, &ctx.verifier);
        ctx.client.register(&ctx.verifier);
        ctx.client.stake(&ctx.verifier, &1_000);
        ctx.client.slash(&ctx.verifier, &500);
        ctx.client.unstake(&ctx.verifier);

        assert_eq!(
            balance(&ctx.env, &ctx.token, &ctx.verifier),
            pre - 500 // lost 500 to slash
        );
    }

    #[test]
    fn test_unstake_deregisters() {
        let ctx = setup();
        ctx.client.register(&ctx.verifier);
        assert!(ctx.client.is_registered(&ctx.verifier));
        ctx.client.unstake(&ctx.verifier);
        assert!(!ctx.client.is_registered(&ctx.verifier));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #93)")]
    fn test_unstake_without_stake_rejected() {
        let ctx = setup();
        ctx.client.unstake(&ctx.verifier);
    }

    // ── is_registered ──────────────────────────────────────────────────────────

    #[test]
    fn test_is_registered_false_for_new_address() {
        let ctx = setup();
        let stranger = Address::generate(&ctx.env);
        assert!(!ctx.client.is_registered(&stranger));
    }

    #[test]
    fn test_is_registered_true_after_register() {
        let ctx = setup();
        ctx.client.register(&ctx.verifier);
        assert!(ctx.client.is_registered(&ctx.verifier));
    }
}
