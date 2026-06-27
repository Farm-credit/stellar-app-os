#![no_std]

//! Verifier Staking Contract — Closes #491
//!
//! Verifiers must post a minimum bond to participate in tree-planting
//! verification. A fraudulent verification can be proven on-chain and the
//! bond is slashed (transferred to the contract treasury or burned).
//!
//! # Flow
//!   1. Admin calls `initialize(admin, stake_token, min_stake)`.
//!   2. Verifier calls `stake(verifier, amount)` — must be ≥ `min_stake`.
//!   3. Admin or governance calls `slash(verifier, amount)` on proven fraud,
//!      reducing (or zeroing) the verifier's bond.
//!   4. Verifier calls `unstake(verifier)` to withdraw their remaining bond
//!      after leaving the role (bond must not be slashed to zero).
//!   5. `is_eligible(verifier)` can be queried by other contracts before
//!      accepting a verification submission.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env,
};
use harvesta_errors::HarvestaError;

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct VerifierStake {
    pub verifier: Address,
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
    /// Per-verifier stake record
    Stake(Address),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct VerifierStaking;

#[contractimpl]
impl VerifierStaking {
    /// One-time initialisation.
    ///
    /// * `admin`            — address authorised to slash bonds
    /// * `stake_token`      — SAC token verifiers must stake
    /// * `min_stake_amount` — minimum bond in token base units
    pub fn initialize(env: Env, admin: Address, stake_token: Address, min_stake_amount: i128) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        if min_stake_amount <= 0 {
            panic_with_error!(&env, HarvestaError::MinStakeMustBePositive);
        }
        env.storage()
            .instance()
            .set(&DataKey::Config, &(admin, stake_token, min_stake_amount));
    }

    /// Verifier locks `amount` of the stake token as their participation bond.
    /// A verifier can top-up their stake by calling this again.
    pub fn stake(env: Env, verifier: Address, amount: i128) {
        verifier.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        let (_, stake_token, min_stake): (Address, Address, i128) = Self::config(&env);

        let key = DataKey::Stake(verifier.clone());
        if env.storage().persistent().has(&key) {
            // Top-up: add to existing stake
            let mut rec: VerifierStake = env.storage().persistent().get(&key).unwrap();
            rec.amount += amount;
            token::Client::new(&env, &stake_token).transfer(
                &verifier,
                &env.current_contract_address(),
                &amount,
            );
            env.storage().persistent().set(&key, &rec);
        } else {
            // New stake: must meet the minimum
            if amount < min_stake {
                panic_with_error!(&env, HarvestaError::InsufficientStake);
            }
            token::Client::new(&env, &stake_token).transfer(
                &verifier,
                &env.current_contract_address(),
                &amount,
            );
            env.storage().persistent().set(
                &key,
                &VerifierStake {
                    verifier: verifier.clone(),
                    token: stake_token,
                    amount,
                    staked_at: env.ledger().timestamp(),
                    slashed: 0,
                },
            );
        }

        env.events()
            .publish((symbol_short!("staked"), verifier), amount);
    }

    /// Admin slashes `slash_amount` from a verifier's bond on proven fraud.
    /// Slashed tokens remain in the contract (treasury / burn handled off-chain).
    pub fn slash(env: Env, verifier: Address, slash_amount: i128) {
        let (admin, _, _) = Self::config(&env);
        admin.require_auth();

        if slash_amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        let key = DataKey::Stake(verifier.clone());
        let mut rec: VerifierStake = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::VerifierNotStaked));

        if slash_amount > rec.amount {
            panic_with_error!(&env, HarvestaError::SlashExceedsStake);
        }

        rec.amount -= slash_amount;
        rec.slashed += slash_amount;
        env.storage().persistent().set(&key, &rec);

        env.events()
            .publish((symbol_short!("slashed"), verifier), slash_amount);
    }

    /// Verifier withdraws their remaining bond and exits the verifier role.
    pub fn unstake(env: Env, verifier: Address) {
        verifier.require_auth();

        let key = DataKey::Stake(verifier.clone());
        let rec: VerifierStake = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::VerifierNotStaked));

        let amount = rec.amount;
        if amount > 0 {
            token::Client::new(&env, &rec.token).transfer(
                &env.current_contract_address(),
                &verifier,
                &amount,
            );
        }

        env.storage().persistent().remove(&key);

        env.events()
            .publish((symbol_short!("unstaked"), verifier), amount);
    }

    /// Returns true if the verifier has a stake ≥ `min_stake_amount`.
    pub fn is_eligible(env: Env, verifier: Address) -> bool {
        let (_, _, min_stake) = Self::config(&env);
        env.storage()
            .persistent()
            .get::<DataKey, VerifierStake>(&DataKey::Stake(verifier))
            .map(|r| r.amount >= min_stake)
            .unwrap_or(false)
    }

    /// Returns the stake record for a verifier, or None.
    pub fn get_stake(env: Env, verifier: Address) -> Option<VerifierStake> {
        env.storage()
            .persistent()
            .get(&DataKey::Stake(verifier))
    }

    /// Returns the configured minimum stake amount.
    pub fn get_min_stake(env: Env) -> i128 {
        let (_, _, min_stake) = Self::config(&env);
        min_stake
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn config(env: &Env) -> (Address, Address, i128) {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized))
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
        setup_with_min(1_000)
    }

    fn setup_with_min(min_stake: i128) -> Ctx {
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
        client.initialize(&admin, &token, &min_stake);

        Ctx { env, admin, verifier, token, client }
    }

    fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
        token::Client::new(env, token).balance(who)
    }

    // ── initialize ─────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let ctx = setup();
        ctx.client.initialize(&ctx.admin, &ctx.token, &1_000);
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
        client.initialize(&admin, &token_id, &0);
    }

    // ── stake ──────────────────────────────────────────────────────────────────

    #[test]
    fn test_stake_transfers_tokens_and_stores_record() {
        let ctx = setup();
        let pre = balance(&ctx.env, &ctx.token, &ctx.verifier);
        ctx.client.stake(&ctx.verifier, &2_000);
        assert_eq!(balance(&ctx.env, &ctx.token, &ctx.verifier), pre - 2_000);

        let rec = ctx.client.get_stake(&ctx.verifier).unwrap();
        assert_eq!(rec.amount, 2_000);
        assert_eq!(rec.slashed, 0);
        assert_eq!(rec.verifier, ctx.verifier);
    }

    #[test]
    fn test_topup_adds_to_existing_stake() {
        let ctx = setup();
        ctx.client.stake(&ctx.verifier, &1_000);
        ctx.client.stake(&ctx.verifier, &500);

        let rec = ctx.client.get_stake(&ctx.verifier).unwrap();
        assert_eq!(rec.amount, 1_500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #95)")]
    fn test_stake_below_minimum_rejected() {
        let ctx = setup();
        ctx.client.stake(&ctx.verifier, &999);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_stake_zero_amount_rejected() {
        let ctx = setup();
        ctx.client.stake(&ctx.verifier, &0);
    }

    // ── is_eligible ────────────────────────────────────────────────────────────

    #[test]
    fn test_eligible_after_meeting_minimum() {
        let ctx = setup();
        assert!(!ctx.client.is_eligible(&ctx.verifier));
        ctx.client.stake(&ctx.verifier, &1_000);
        assert!(ctx.client.is_eligible(&ctx.verifier));
    }

    #[test]
    fn test_not_eligible_after_slash_below_minimum() {
        let ctx = setup();
        ctx.client.stake(&ctx.verifier, &1_000);
        ctx.client.slash(&ctx.verifier, &500);
        assert!(!ctx.client.is_eligible(&ctx.verifier));
    }

    // ── slash ──────────────────────────────────────────────────────────────────

    #[test]
    fn test_slash_reduces_stake_and_records_slashed() {
        let ctx = setup();
        ctx.client.stake(&ctx.verifier, &2_000);
        ctx.client.slash(&ctx.verifier, &800);

        let rec = ctx.client.get_stake(&ctx.verifier).unwrap();
        assert_eq!(rec.amount, 1_200);
        assert_eq!(rec.slashed, 800);
    }

    #[test]
    fn test_slash_full_bond() {
        let ctx = setup();
        ctx.client.stake(&ctx.verifier, &1_000);
        ctx.client.slash(&ctx.verifier, &1_000);

        let rec = ctx.client.get_stake(&ctx.verifier).unwrap();
        assert_eq!(rec.amount, 0);
        assert_eq!(rec.slashed, 1_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #94)")]
    fn test_slash_exceeds_stake_rejected() {
        let ctx = setup();
        ctx.client.stake(&ctx.verifier, &1_000);
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
    fn test_unstake_returns_tokens_and_removes_record() {
        let ctx = setup();
        let pre = balance(&ctx.env, &ctx.token, &ctx.verifier);
        ctx.client.stake(&ctx.verifier, &2_000);
        ctx.client.unstake(&ctx.verifier);

        assert_eq!(balance(&ctx.env, &ctx.token, &ctx.verifier), pre);
        assert!(ctx.client.get_stake(&ctx.verifier).is_none());
        assert!(!ctx.client.is_eligible(&ctx.verifier));
    }

    #[test]
    fn test_unstake_after_partial_slash_returns_remainder() {
        let ctx = setup();
        let pre = balance(&ctx.env, &ctx.token, &ctx.verifier);
        ctx.client.stake(&ctx.verifier, &2_000);
        ctx.client.slash(&ctx.verifier, &500);
        ctx.client.unstake(&ctx.verifier);

        assert_eq!(balance(&ctx.env, &ctx.token, &ctx.verifier), pre - 500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #93)")]
    fn test_unstake_without_stake_rejected() {
        let ctx = setup();
        ctx.client.unstake(&ctx.verifier);
    }
}
