#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, Symbol,
};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum CarbonInsuranceError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidPremium = 4,
    InvalidCoverage = 5,
    PolicyNotFound = 6,
    PolicyAlreadyResolved = 7,
    PolicyNotDenied = 8,
    InvalidThreshold = 9,
    TokenNotSet = 10,
}

/// Guarantee ratio: verified-loss payout = 80% of the insured coverage.
///
/// Expressed in basis points (1/10_000) rather than a percent so all
/// arithmetic stays exact on-chain. Stored in instance storage;
/// admin-adjustable within 1..=10_000.
pub const DEFAULT_GUARANTEE_RATE_BPS: u32 = 8_000;
pub const CLAIMED_EVENT: Symbol = symbol_short!("claimed");
pub const PAID_EVENT: Symbol = symbol_short!("paid");

// ── Types ─────────────────────────────────────────────────────────────────────

/// Lifecycle of an insurance policy.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PolicyStatus {
    /// Coverage active; verification outcome not yet recorded.
    Active,
    /// Project passed verification — no payout owed.
    Verified,
    /// Project failed verification — farmer is owed the guaranteed payout.
    Denied,
    /// Guaranteed payout transferred to the farmer.
    Paid,
}

/// A carbon-credit insurance policy backing one project.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Policy {
    /// Farmer (policyholder) who purchased the coverage.
    pub farmer: Address,
    /// Project the policy protects.
    pub project: Symbol,
    /// Token the premium was paid in and the payout is made in.
    pub token: Address,
    /// Total coverage the guarantee applies to.
    pub coverage: i128,
    /// Premium actually paid for this policy.
    pub premium: i128,
    pub status: PolicyStatus,
}

/// Record of a paid-out claim.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Claim {
    pub policy_id: u64,
    /// Amount actually transferred to the farmer.
    pub amount: i128,
    pub paid_at: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    Token,
    GuaranteeRateBps,
    NextPolicyId,
    Policy(u64),
    Claim(u64),
    /// Total premiums retained by the contract (the guarantee pool).
    Pool,
}

/// Insurance for carbon-credit projects: if a project fails verification, the
/// farmer is still paid the guaranteed share (default 80%) of their coverage
/// from the premium pool (issue #1350, v1).
#[contract]
pub struct CarbonInsurance;

#[contractimpl]
impl CarbonInsurance {
    /// Initializes the contract with its admin and the settlement token.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, CarbonInsuranceError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage()
            .instance()
            .set(&DataKey::GuaranteeRateBps, &DEFAULT_GUARANTEE_RATE_BPS);
        env.storage().instance().set(&DataKey::NextPolicyId, &0_u64);
        env.storage().instance().set(&DataKey::Pool, &0_i128);
    }

    /// Updates the guaranteed payout ratio (in basis points, 1..=10_000).
    pub fn set_guarantee_rate(env: Env, rate_bps: u32) {
        Self::require_admin(&env);
        if rate_bps == 0 || rate_bps > 10_000 {
            panic_with_error!(&env, CarbonInsuranceError::InvalidThreshold);
        }
        env.storage()
            .instance()
            .set(&DataKey::GuaranteeRateBps, &rate_bps);
    }

    /// Returns the current guaranteed payout ratio in basis points.
    pub fn guarantee_rate_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::GuaranteeRateBps)
            .unwrap_or(DEFAULT_GUARANTEE_RATE_BPS)
    }

    /// Returns the address of the settlement token.
    pub fn token(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(&env, CarbonInsuranceError::TokenNotSet))
    }

    /// Returns the admin address, if initialized.
    pub fn admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Admin)
    }

    /// Total premiums currently held by the contract (the guarantee pool).
    pub fn pool_balance(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Pool).unwrap_or(0)
    }

    /// Purchases a policy for `project` by paying the premium upfront.
    ///
    /// The premium is pulled from the farmer into the contract and forms part
    /// of the guarantee pool. Coverage is the amount the guarantee applies to.
    ///
    /// Returns the new policy id.
    pub fn purchase_policy(
        env: Env,
        farmer: Address,
        project: Symbol,
        token: Address,
        coverage: i128,
        premium: i128,
    ) -> u64 {
        farmer.require_auth();
        if premium <= 0 {
            panic_with_error!(&env, CarbonInsuranceError::InvalidPremium);
        }
        if coverage <= 0 {
            panic_with_error!(&env, CarbonInsuranceError::InvalidCoverage);
        }

        let configured = Self::token(env.clone());
        if configured != token {
            panic_with_error!(&env, CarbonInsuranceError::TokenNotSet);
        }

        token::Client::new(&env, &token).transfer(
            &farmer,
            &env.current_contract_address(),
            &premium,
        );

        let policy_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextPolicyId)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::NextPolicyId, &(policy_id + 1));

        let policy = Policy {
            farmer: farmer.clone(),
            project: project.clone(),
            token: token.clone(),
            coverage,
            premium,
            status: PolicyStatus::Active,
        };
        env.storage()
            .instance()
            .set(&DataKey::Policy(policy_id), &policy);

        let pool: i128 = env.storage().instance().get(&DataKey::Pool).unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::Pool, &(pool + premium));

        policy_id
    }

    /// Records that the project behind `policy_id` passed verification.
    pub fn mark_verified(env: Env, policy_id: u64) {
        Self::require_admin(&env);
        let mut policy = Self::policy(env.clone(), policy_id);
        if policy.status != PolicyStatus::Active {
            panic_with_error!(&env, CarbonInsuranceError::PolicyAlreadyResolved);
        }
        policy.status = PolicyStatus::Verified;
        env.storage()
            .instance()
            .set(&DataKey::Policy(policy_id), &policy);
    }

    /// Records that the project behind `policy_id` failed verification and
    /// pays the farmer the guaranteed share of their coverage immediately.
    ///
    /// The payout is `coverage × guarantee_rate / 10_000` (80% by default),
    /// capped at the pool balance so the pool can never go negative. Emits
    /// `claimed` and `paid` events.
    pub fn mark_denied_and_claim(env: Env, policy_id: u64) {
        Self::require_admin(&env);
        let mut policy = Self::policy(env.clone(), policy_id);
        match policy.status {
            PolicyStatus::Active => {}
            PolicyStatus::Verified => {
                panic_with_error!(&env, CarbonInsuranceError::PolicyNotDenied)
            }
            PolicyStatus::Denied | PolicyStatus::Paid => {
                panic_with_error!(&env, CarbonInsuranceError::PolicyAlreadyResolved)
            }
        }

        let rate_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::GuaranteeRateBps)
            .unwrap_or(DEFAULT_GUARANTEE_RATE_BPS);
        let guaranteed = policy.coverage * rate_bps as i128 / 10_000;

        let pool: i128 = env.storage().instance().get(&DataKey::Pool).unwrap_or(0);
        let payout = if guaranteed > pool { pool } else { guaranteed };

        if payout > 0 {
            let contract_addr = env.current_contract_address();
            token::Client::new(&env, &policy.token).transfer(
                &contract_addr,
                &policy.farmer,
                &payout,
            );
            env.storage()
                .instance()
                .set(&DataKey::Pool, &(pool - payout));
        }

        policy.status = PolicyStatus::Paid;
        env.storage()
            .instance()
            .set(&DataKey::Policy(policy_id), &policy);

        env.storage().instance().set(
            &DataKey::Claim(policy_id),
            &Claim {
                policy_id,
                amount: payout,
                paid_at: env.ledger().timestamp(),
            },
        );

        env.events().publish(
            (CLAIMED_EVENT, policy.project.clone()),
            (policy_id, policy.farmer.clone(), payout),
        );
        env.events()
            .publish((PAID_EVENT, policy.farmer.clone()), (policy_id, payout));
    }

    /// Returns the policy record for `policy_id`.
    pub fn policy(env: Env, policy_id: u64) -> Policy {
        env.storage()
            .instance()
            .get(&DataKey::Policy(policy_id))
            .unwrap_or_else(|| panic_with_error!(&env, CarbonInsuranceError::PolicyNotFound))
    }

    /// Returns the payout record for `policy_id`, if one was paid.
    pub fn claim(env: Env, policy_id: u64) -> Option<Claim> {
        env.storage().instance().get(&DataKey::Claim(policy_id))
    }

    /// Convenience view: the guaranteed payout for a policy at the current
    /// guarantee rate.
    pub fn guaranteed_amount(env: Env, policy_id: u64) -> i128 {
        let policy = Self::policy(env.clone(), policy_id);
        let rate_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::GuaranteeRateBps)
            .unwrap_or(DEFAULT_GUARANTEE_RATE_BPS);
        policy.coverage * rate_bps as i128 / 10_000
    }

    fn require_admin(env: &Env) -> Address {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, CarbonInsuranceError::NotInitialized));
        admin.require_auth();
        admin
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, testutils::Events, Env, Vec};

    fn setup() -> (Env, Address, Address, CarbonInsuranceClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let contract_id = env.register_contract(None, CarbonInsurance);
        let client = CarbonInsuranceClient::new(&env, &contract_id);
        client.initialize(&admin, &token_id);
        (env, admin, token_id, client)
    }

    fn mint(env: &Env, token_id: &Address, to: &Address, amount: i128) {
        token::StellarAssetClient::new(env, token_id).mint(to, &amount);
    }

    fn balance(env: &Env, token_id: &Address, of: &Address) -> i128 {
        token::Client::new(env, token_id).balance(of)
    }

    /// Purchases `count` policies (one per fresh farmer), each with
    /// `coverage`/`premium`, returning the policy ids and the farmers.
    fn purchase_batch(
        env: &Env,
        client: &CarbonInsuranceClient,
        token_id: &Address,
        count: u64,
        coverage: i128,
        premium: i128,
    ) -> (Vec<u64>, Vec<Address>) {
        let mut ids = Vec::new(env);
        let mut farmers = Vec::new(env);
        for _ in 0..count {
            let farmer = Address::generate(env);
            mint(env, token_id, &farmer, 10_000);
            let project = Symbol::new(env, "proj");
            let id = client.purchase_policy(&farmer, &project, token_id, &coverage, &premium);
            ids.push_back(id);
            farmers.push_back(farmer);
        }
        (ids, farmers)
    }

    #[test]
    fn test_initialize() {
        let (_, admin, _, client) = setup();
        assert_eq!(client.admin(), Some(admin));
        assert_eq!(client.guarantee_rate_bps(), 8_000);
        assert_eq!(client.pool_balance(), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_init_panics() {
        let (_, admin, token_id, client) = setup();
        client.initialize(&admin, &token_id);
    }

    #[test]
    fn test_set_and_get_guarantee_rate() {
        let (_, _, _, client) = setup();
        client.set_guarantee_rate(&9_500_u32);
        assert_eq!(client.guarantee_rate_bps(), 9_500);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_set_guarantee_rate_rejects_zero() {
        let (_, _, _, client) = setup();
        client.set_guarantee_rate(&0_u32);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_set_guarantee_rate_rejects_above_100pct() {
        let (_, _, _, client) = setup();
        client.set_guarantee_rate(&10_001_u32);
    }

    #[test]
    fn test_purchase_policy_moves_premium_into_pool() {
        let (env, _, token_id, client) = setup();
        let farmer = Address::generate(&env);
        mint(&env, &token_id, &farmer, 1_000);

        let id = client.purchase_policy(
            &farmer,
            &Symbol::new(&env, "proj1"),
            &token_id,
            &1_000_i128,
            &100_i128,
        );

        let policy = client.policy(&id);
        assert_eq!(policy.farmer, farmer);
        assert_eq!(policy.coverage, 1_000);
        assert_eq!(policy.premium, 100);
        assert_eq!(policy.status, PolicyStatus::Active);
        assert_eq!(client.pool_balance(), 100);
        assert_eq!(balance(&env, &token_id, &farmer), 900);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_purchase_policy_rejects_zero_premium() {
        let (env, _, token_id, client) = setup();
        let farmer = Address::generate(&env);
        client.purchase_policy(
            &farmer,
            &Symbol::new(&env, "proj1"),
            &token_id,
            &1_000_i128,
            &0_i128,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_purchase_policy_rejects_zero_coverage() {
        let (env, _, token_id, client) = setup();
        let farmer = Address::generate(&env);
        mint(&env, &token_id, &farmer, 1_000);
        client.purchase_policy(
            &farmer,
            &Symbol::new(&env, "proj1"),
            &token_id,
            &0_i128,
            &100_i128,
        );
    }

    #[test]
    fn test_verified_policy_pays_nothing() {
        let (env, _, token_id, client) = setup();
        let farmer = Address::generate(&env);
        mint(&env, &token_id, &farmer, 1_000);

        let id = client.purchase_policy(
            &farmer,
            &Symbol::new(&env, "proj1"),
            &token_id,
            &1_000_i128,
            &100_i128,
        );
        client.mock_all_auths().mark_verified(&id);

        let policy = client.policy(&id);
        assert_eq!(policy.status, PolicyStatus::Verified);
        assert!(client.claim(&id).is_none());
        assert_eq!(client.pool_balance(), 100);
        // Farmer is only out the premium.
        assert_eq!(balance(&env, &token_id, &farmer), 900);
    }

    /// 8 policies × premium 100 seed the pool with exactly the 80% guarantee
    /// of a 1_000 coverage, so the denied farmer receives the full guarantee.
    #[test]
    fn test_denied_policy_guarantees_80_percent_payout() {
        let (env, _, token_id, client) = setup();
        let (ids, farmers) = purchase_batch(&env, &client, &token_id, 8, 1_000, 100);
        assert_eq!(client.pool_balance(), 800);

        client.mock_all_auths().mark_denied_and_claim(&ids.get(0).unwrap());

        let denied_id = ids.get(0).unwrap();
        let denied_farmer = farmers.get(0).unwrap();
        let policy = client.policy(&denied_id);
        assert_eq!(policy.status, PolicyStatus::Paid);
        assert_eq!(client.guaranteed_amount(&denied_id), 800);

        let claim = client.claim(&denied_id).expect("claim recorded");
        assert_eq!(claim.amount, 800);
        assert_eq!(claim.policy_id, denied_id);

        assert_eq!(balance(&env, &token_id, &denied_farmer), 10_000 - 100 + 800);
        assert_eq!(client.pool_balance(), 0);
    }

    #[test]
    fn test_payout_is_capped_at_pool_balance() {
        let (env, _, token_id, client) = setup();
        let farmer = Address::generate(&env);
        mint(&env, &token_id, &farmer, 1_000);

        // Coverage 10_000 → guaranteed 8_000, but the pool only holds 100.
        let id = client.purchase_policy(
            &farmer,
            &Symbol::new(&env, "proj1"),
            &token_id,
            &10_000_i128,
            &100_i128,
        );
        client.mock_all_auths().mark_denied_and_claim(&id);

        let claim = client.claim(&id).expect("claim recorded");
        assert_eq!(claim.amount, 100);
        assert_eq!(balance(&env, &token_id, &farmer), 900 + 100);
        assert_eq!(client.pool_balance(), 0);
    }

    /// 20 policies × premium 100 = pool 2_000; two denials each pay the full
    /// 80% guarantee (800) and the pool still stands.
    #[test]
    fn test_multiple_denials_paid_from_accumulated_pool() {
        let (env, _, token_id, client) = setup();
        let (ids, _) = purchase_batch(&env, &client, &token_id, 20, 1_000, 100);

        client.mock_all_auths().mark_denied_and_claim(&ids.get(0).unwrap());
        client.mock_all_auths().mark_denied_and_claim(&ids.get(1).unwrap());

        assert_eq!(client.claim(&ids.get(0).unwrap()).unwrap().amount, 800);
        assert_eq!(client.claim(&ids.get(1).unwrap()).unwrap().amount, 800);
        assert_eq!(client.pool_balance(), 2_000 - 800 - 800);
    }

    /// Seven verified policies (premiums kept) fund the guarantee for the one
    /// that fails verification.
    #[test]
    fn test_verified_premiums_fund_single_denial() {
        let (env, _, token_id, client) = setup();
        let (ids, _) = purchase_batch(&env, &client, &token_id, 8, 1_000, 100);

        for i in 1..8 {
            client.mock_all_auths().mark_verified(&ids.get(i).unwrap());
        }
        client.mock_all_auths().mark_denied_and_claim(&ids.get(0).unwrap());

        assert_eq!(client.claim(&ids.get(0).unwrap()).unwrap().amount, 800);
        assert_eq!(client.pool_balance(), 0);
        // Verified farmers keep their coverage; only premiums were paid.
        assert_eq!(client.policy(&ids.get(1).unwrap()).status, PolicyStatus::Verified);
        assert!(client.claim(&ids.get(1).unwrap()).is_none());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_mark_verified_after_resolved_panics() {
        let (env, _, token_id, client) = setup();
        let farmer = Address::generate(&env);
        mint(&env, &token_id, &farmer, 1_000);

        let id = client.purchase_policy(
            &farmer,
            &Symbol::new(&env, "proj1"),
            &token_id,
            &1_000_i128,
            &100_i128,
        );
        client.mock_all_auths().mark_denied_and_claim(&id);
        client.mock_all_auths().mark_verified(&id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_mark_denied_twice_panics() {
        let (env, _, token_id, client) = setup();
        let farmer = Address::generate(&env);
        mint(&env, &token_id, &farmer, 1_000);

        let id = client.purchase_policy(
            &farmer,
            &Symbol::new(&env, "proj1"),
            &token_id,
            &1_000_i128,
            &100_i128,
        );
        client.mock_all_auths().mark_denied_and_claim(&id);
        client.mock_all_auths().mark_denied_and_claim(&id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_mark_denied_after_verified_panics() {
        let (env, _, token_id, client) = setup();
        let farmer = Address::generate(&env);
        mint(&env, &token_id, &farmer, 1_000);

        let id = client.purchase_policy(
            &farmer,
            &Symbol::new(&env, "proj1"),
            &token_id,
            &1_000_i128,
            &100_i128,
        );
        client.mock_all_auths().mark_verified(&id);
        client.mock_all_auths().mark_denied_and_claim(&id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_policy_not_found_panics() {
        let (_, _, _, client) = setup();
        client.policy(&99_u64);
    }

    #[test]
    fn test_claim_event_carries_project_topic_and_payout() {
        use soroban_sdk::xdr::{ContractEventBody, ScVal};
        use soroban_sdk::{TryFromVal, Val};

        let (env, _, token_id, client) = setup();
        let farmer = Address::generate(&env);
        mint(&env, &token_id, &farmer, 1_000);

        let project = Symbol::new(&env, "proj1");
        let id = client.purchase_policy(&farmer, &project, &token_id, &1_000_i128, &100_i128);
        client.mock_all_auths().mark_denied_and_claim(&id);

        let events = env.events().all();
        let mut found = false;
        for event in events.events() {
            let ContractEventBody::V0(v0) = &event.body;
            let topics: &[ScVal] = v0.topics.as_slice();
            if topics.len() != 2 {
                continue;
            }
            // Topic 0 must be the `claimed` symbol, topic 1 the project.
            let name: Symbol = match Symbol::try_from_val(&env, &topics[0]) {
                Ok(s) => s,
                Err(_) => continue,
            };
            if name != CLAIMED_EVENT {
                continue;
            }
            let ev_project: Symbol = match Symbol::try_from_val(&env, &topics[1]) {
                Ok(s) => s,
                Err(_) => continue,
            };
            if ev_project != project {
                continue;
            }
            // Data must be (policy_id, farmer, payout).
            let ScVal::Vec(data_opt) = &v0.data else {
                continue;
            };
            let Some(data) = data_opt else {
                continue;
            };
            let data: &[ScVal] = data.as_slice();
            if data.len() != 3 {
                continue;
            }
            // Primitives convert ScVal → Val → primitive in the sdk.
            let to_u64 = |sc: &ScVal| -> Option<u64> {
                let v = Val::try_from_val(&env, sc).ok()?;
                u64::try_from_val(&env, &v).ok()
            };
            let to_i128 = |sc: &ScVal| -> Option<i128> {
                let v = Val::try_from_val(&env, sc).ok()?;
                i128::try_from_val(&env, &v).ok()
            };
            let Some(ev_id) = to_u64(&data[0]) else {
                continue;
            };
            let ev_farmer = match Address::try_from_val(&env, &data[1]) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let Some(ev_amount) = to_i128(&data[2]) else {
                continue;
            };
            assert_eq!(ev_id, id);
            assert_eq!(ev_farmer, farmer);
            assert_eq!(ev_amount, 100);
            found = true;
        }
        assert!(found, "expected a claimed event for the project");
    }
}
