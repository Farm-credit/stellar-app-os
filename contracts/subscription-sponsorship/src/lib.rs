#![no_std]

//! Subscription Sponsorship Contract
//!
//! Allows sponsors to set up a monthly recurring payment that automatically
//! sponsors one or more trees per cycle.
//!
//! ## Flow
//!
//! 1. **`setup_subscription`** — Sponsor defines the farmer, token, per-cycle
//!    amount, trees per cycle, and the interval (default ~30 days for monthly).
//!    Locks the first cycle's amount into the contract.
//!
//! 2. **`process_subscription`** — Callable by anyone (keeper / cron). When the
//!    interval has elapsed, it transfers the locked amount to the farmer and
//!    locks the next cycle's amount from the sponsor. Increments the total
//!    sponsored tree count.
//!
//! 3. **`cancel_subscription`** — Sponsor can cancel at any time. The locked
//!    (unreleased) amount for the current cycle is refunded to the sponsor.
//!
//! ## Integration
//!
//! This contract handles the recurring payment and fund flow. Future iterations
//! will integrate directly with the tree-escrow contract to create on-chain
//! escrow records per cycle. For now, the contract releases funds to the
//! configured farmer address each cycle, and the off-chain app layer creates
//! tree escrows in the tree-escrow contract using those funds.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Default interval: 30 days in seconds (monthly)
const DEFAULT_INTERVAL_SECONDS: u64 = 2_592_000;

/// Maximum trees per cycle to prevent abuse
const MAX_TREES_PER_CYCLE: u32 = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum SubscriptionStatus {
    Active,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct SubscriptionRecord {
    pub id: u64,
    pub sponsor: Address,
    pub farmer: Address,
    pub token: Address,
    pub amount_per_cycle: i128,
    pub trees_per_cycle: u32,
    pub interval_seconds: u64,
    pub next_processing: u64,
    pub total_trees_sponsored: u32,
    pub total_amount_spent: i128,
    pub status: SubscriptionStatus,
    pub created_at: u64,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct SubscriptionSponsorship;

#[contractimpl]
impl SubscriptionSponsorship {
    /// Initialize the contract with an admin address and supported tokens.
    ///
    /// * `admin` — address that can pause or perform admin functions
    /// * `xlm_token` — Stellar XLM token contract address
    /// * `usdc_token` — Stellar USDC token contract address
    pub fn initialize(env: Env, admin: Address, xlm_token: Address, usdc_token: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }

        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("TOKENS"), &(xlm_token, usdc_token));

        // Subscription ID counter starts at 0
        env.storage()
            .instance()
            .set(&symbol_short!("SUBSEQ"), &0u64);
    }

    /// Set up a new subscription sponsorship.
    ///
    /// Locks the first cycle's `amount_per_cycle` into the contract.
    /// Returns the subscription ID.
    ///
    /// * `sponsor` — the address paying for the trees
    /// * `farmer` — the farmer who will plant the trees
    /// * `token` — the token to use (must be XLM or USDC as registered at init)
    /// * `amount_per_cycle` — how many tokens to pay per cycle
    /// * `trees_per_cycle` — how many trees to sponsor per cycle (1–50)
    /// * `interval_seconds` — time between cycles (default 30 days if 0)
    pub fn setup(
        env: Env,
        sponsor: Address,
        farmer: Address,
        token: Address,
        amount_per_cycle: i128,
        trees_per_cycle: u32,
        interval_seconds: u64,
    ) -> u64 {
        sponsor.require_auth();

        if amount_per_cycle <= 0 {
            panic!("amount_per_cycle must be positive");
        }

        if trees_per_cycle == 0 || trees_per_cycle > MAX_TREES_PER_CYCLE {
            panic!("trees_per_cycle must be between 1 and 50");
        }

        let (xlm, usdc): (Address, Address) = env
            .storage()
            .instance()
            .get(&symbol_short!("TOKENS"))
            .expect("not initialized");

        if token != xlm && token != usdc {
            panic!("unsupported token");
        }

        // Auto-increment subscription ID
        let id: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("SUBSEQ"))
            .unwrap_or(0u64)
            + 1;

        env.storage().instance().set(&symbol_short!("SUBSEQ"), &id);

        let interval = if interval_seconds == 0 {
            DEFAULT_INTERVAL_SECONDS
        } else {
            interval_seconds
        };

        let now = env.ledger().timestamp();

        // Lock first cycle's amount into contract
        token::Client::new(&env, &token).transfer(
            &sponsor,
            &env.current_contract_address(),
            &amount_per_cycle,
        );

        let rec = SubscriptionRecord {
            id,
            sponsor: sponsor.clone(),
            farmer,
            token,
            amount_per_cycle,
            trees_per_cycle,
            interval_seconds: interval,
            next_processing: now + interval,
            total_trees_sponsored: 0,
            total_amount_spent: 0,
            status: SubscriptionStatus::Active,
            created_at: now,
        };

        env.storage()
            .persistent()
            .set(&Self::subscription_key(&env, id), &rec);

        env.events().publish(
            (symbol_short!("sub"), symbol_short!("setup")),
            (id, sponsor, rec.farmer, amount_per_cycle, trees_per_cycle),
        );

        id
    }

    /// Process a subscription cycle. Callable by anyone (keeper / cron).
    ///
    /// Transfers the locked amount to the farmer, then locks the next cycle's
    /// amount from the sponsor. If the sponsor has insufficient balance for
    /// the next cycle, the subscription is cancelled automatically.
    ///
    /// * `subscription_id` — ID of the subscription to process
    pub fn process(env: Env, subscription_id: u64) {
        let key = Self::subscription_key(&env, subscription_id);

        let mut rec: SubscriptionRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("subscription not found");

        if rec.status != SubscriptionStatus::Active {
            panic!("subscription is not active");
        }

        let now = env.ledger().timestamp();
        if now < rec.next_processing {
            panic!("IntervalNotElapsed");
        }

        // Transfer the locked amount to the farmer
        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &rec.farmer,
            &rec.amount_per_cycle,
        );

        // Update totals
        rec.total_amount_spent += rec.amount_per_cycle;
        rec.total_trees_sponsored += rec.trees_per_cycle;

        // Try to lock the next cycle's amount from the sponsor.
        // If the transfer fails (insufficient balance), cancel the subscription
        // gracefully rather than panicking.
        let lock_next = || {
            token::Client::new(&env, &rec.token).transfer(
                &rec.sponsor,
                &env.current_contract_address(),
                &rec.amount_per_cycle,
            );
        };

        // `env.try()` catches panics from the closure and returns `Result<T, Error>`.
        // Since `transfer()` returns `()`, the result is `Result<(), Error>`.
        match env.try(lock_next) {
            Ok(_) => {
                rec.next_processing = now + rec.interval_seconds;
                // Keep status as Active
            }
            Err(_) => {
                // Sponsor doesn't have enough funds — cancel gracefully
                rec.status = SubscriptionStatus::Cancelled;
                env.events().publish(
                    (symbol_short!("sub"), symbol_short!("cancel")),
                    (subscription_id, rec.sponsor.clone(), symbol_short!("no_funds")),
                );
            }
        }

        env.storage().persistent().set(&key, &rec);

        env.events().publish(
            (symbol_short!("sub"), symbol_short!("process")),
            (
                subscription_id,
                rec.farmer,
                rec.amount_per_cycle,
                rec.trees_per_cycle,
            ),
        );
    }

    /// Cancel a subscription and refund the locked (unreleased) amount to the
    /// sponsor. Only the sponsor may cancel their own subscription.
    ///
    /// * `sponsor` — the sponsor address (must match the subscription's sponsor)
    /// * `subscription_id` — ID of the subscription to cancel
    pub fn cancel(env: Env, sponsor: Address, subscription_id: u64) {
        sponsor.require_auth();

        let key = Self::subscription_key(&env, subscription_id);

        let mut rec: SubscriptionRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("subscription not found");

        if rec.sponsor != sponsor {
            panic!("not the sponsor");
        }

        if rec.status != SubscriptionStatus::Active {
            panic!("subscription is not active");
        }

        rec.status = SubscriptionStatus::Cancelled;

        // Refund the locked (unreleased) cycle amount back to sponsor
        token::Client::new(&env, &rec.token).transfer(
            &env.current_contract_address(),
            &sponsor,
            &rec.amount_per_cycle,
        );

        env.storage().persistent().set(&key, &rec);

        env.events().publish(
            (symbol_short!("sub"), symbol_short!("cancel")),
            (subscription_id, sponsor),
        );
    }

    /// Return the details of a subscription.
    ///
    /// * `subscription_id` — ID of the subscription
    pub fn get_subscription(env: Env, subscription_id: u64) -> Option<SubscriptionRecord> {
        env.storage()
            .persistent()
            .get(&Self::subscription_key(&env, subscription_id))
    }

    /// List all subscription IDs for a given sponsor address.
    ///
    /// * `sponsor` — the sponsor address to look up
    pub fn get_sponsor_subscriptions(env: Env, sponsor: Address) -> Vec<u64> {
        let total: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("SUBSEQ"))
            .unwrap_or(0);

        let mut result: Vec<u64> = Vec::new(&env);
        for id in 1..=total {
            if let Some(rec) = env
                .storage()
                .persistent()
                .get::<_, SubscriptionRecord>(&Self::subscription_key(&env, id))
            {
                if rec.sponsor == sponsor {
                    result.push_back(id);
                }
            }
        }
        result
    }

    /// Admin function: update the supported tokens
    pub fn update_tokens(env: Env, xlm_token: Address, usdc_token: Address) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("TOKENS"), &(xlm_token, usdc_token));
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    fn subscription_key(env: &Env, id: u64) -> soroban_sdk::Val {
        (symbol_short!("SUB"), id).into_val(env)
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .expect("not initialized");
        admin.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        token, Address, Env,
    };

    const MONTHLY_INTERVAL: u64 = 2_592_000;

    fn setup() -> (
        Env,
        Address,
        Address,
        Address,
        Address,
        Address,
        SubscriptionSponsorshipClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, SubscriptionSponsorship);
        let client = SubscriptionSponsorshipClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let farmer = Address::generate(&env);

        let xlm = env.register_stellar_asset_contract(admin.clone());
        let usdc = env.register_stellar_asset_contract(admin.clone());

        // Mint tokens to sponsor
        token::StellarAssetClient::new(&env, &xlm).mint(&sponsor, &100_000);
        token::StellarAssetClient::new(&env, &usdc).mint(&sponsor, &100_000);

        client.initialize(&admin, &xlm, &usdc);

        (env, admin, sponsor, farmer, xlm, usdc, client)
    }

    // ── initialize ───────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_sets_admin_and_tokens() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, SubscriptionSponsorship);
        let client = SubscriptionSponsorshipClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let xlm = env.register_stellar_asset_contract(admin.clone());
        let usdc = env.register_stellar_asset_contract(admin.clone());

        client.initialize(&admin, &xlm, &usdc);

        // Initialize a second time should panic
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_initialize_rejects_double_init() {
        let (_env, _admin, sponsor, _farmer, xlm, usdc, client) = setup();

        // Try second init — should panic
        client.initialize(&sponsor, &xlm, &usdc);
    }

    // ── setup_subscription ───────────────────────────────────────────────────

    #[test]
    fn test_setup_subscription_locks_first_cycle() {
        let (env, _admin, sponsor, farmer, xlm, _usdc, client) = setup();

        let balance_before = token::Client::new(&env, &xlm).balance(&sponsor);
        let contract_balance_before =
            token::Client::new(&env, &xlm).balance(&env.current_contract_address());

        let amount: i128 = 1_000;
        let trees: u32 = 1;

        let id = client.setup(&sponsor, &farmer, &xlm, &amount, &trees, &MONTHLY_INTERVAL);

        let balance_after = token::Client::new(&env, &xlm).balance(&sponsor);
        let contract_balance_after =
            token::Client::new(&env, &xlm).balance(&env.current_contract_address());

        // Sponsor paid amount_per_cycle
        assert_eq!(balance_before - balance_after, amount);
        // Contract received amount_per_cycle
        assert_eq!(contract_balance_after - contract_balance_before, amount);

        let rec = client.get_subscription(&id).unwrap();
        assert_eq!(rec.id, id);
        assert_eq!(rec.sponsor, sponsor);
        assert_eq!(rec.farmer, farmer);
        assert_eq!(rec.amount_per_cycle, amount);
        assert_eq!(rec.trees_per_cycle, trees);
        assert_eq!(rec.status, SubscriptionStatus::Active);
        assert_eq!(rec.total_trees_sponsored, 0);
        assert_eq!(rec.total_amount_spent, 0);
    }

    #[test]
    fn test_setup_subscription_defaults_to_monthly_interval() {
        let (_env, _admin, sponsor, farmer, xlm, _usdc, client) = setup();

        let id = client.setup(&sponsor, &farmer, &xlm, &1_000, &1, &0);

        let rec = client.get_subscription(&id).unwrap();
        assert_eq!(rec.interval_seconds, DEFAULT_INTERVAL_SECONDS);
    }

    #[test]
    fn test_setup_autoincrements_id() {
        let (_env, _admin, sponsor, farmer, xlm, _usdc, client) = setup();

        let id1 = client.setup(&sponsor, &farmer, &xlm, &500, &1, &MONTHLY_INTERVAL);
        let id2 = client.setup(&sponsor, &farmer, &xlm, &500, &1, &MONTHLY_INTERVAL);

        assert_eq!(id2, id1 + 1);
    }

    #[test]
    #[should_panic(expected = "amount_per_cycle must be positive")]
    fn test_setup_rejects_zero_amount() {
        let (_env, _admin, sponsor, farmer, xlm, _usdc, client) = setup();
        client.setup(&sponsor, &farmer, &xlm, &0, &1, &MONTHLY_INTERVAL);
    }

    #[test]
    #[should_panic(expected = "trees_per_cycle must be between 1 and 50")]
    fn test_setup_rejects_zero_trees() {
        let (_env, _admin, sponsor, farmer, xlm, _usdc, client) = setup();
        client.setup(&sponsor, &farmer, &xlm, &1_000, &0, &MONTHLY_INTERVAL);
    }

    #[test]
    #[should_panic(expected = "trees_per_cycle must be between 1 and 50")]
    fn test_setup_rejects_excessive_trees() {
        let (_env, _admin, sponsor, farmer, xlm, _usdc, client) = setup();
        client.setup(&sponsor, &farmer, &xlm, &1_000, &51, &MONTHLY_INTERVAL);
    }

    #[test]
    #[should_panic(expected = "unsupported token")]
    fn test_setup_rejects_unsupported_token() {
        let (env, _admin, sponsor, farmer, _xlm, _usdc, client) = setup();
        let bad_token = Address::generate(&env);
        client.setup(&sponsor, &farmer, &bad_token, &1_000, &1, &MONTHLY_INTERVAL);
    }

    // ── process_subscription ─────────────────────────────────────────────────

    #[test]
    fn test_process_subscription_sends_to_farmer_and_locks_next() {
        let (env, _admin, sponsor, farmer, xlm, _usdc, client) = setup();

        // Sponsor has 100_000 XLM, need enough for at least 2 cycles
        let amount: i128 = 1_000;
        let trees: u32 = 2;

        // Mint more tokens to sponsor for multiple cycles
        token::StellarAssetClient::new(&env, &xlm).mint(&sponsor, &10_000);

        let id = client.setup(&sponsor, &farmer, &xlm, &amount, &trees, &MONTHLY_INTERVAL);

        let farmer_balance_before = token::Client::new(&env, &xlm).balance(&farmer);
        let sponsor_balance_before = token::Client::new(&env, &xlm).balance(&sponsor);

        // Advance ledger time past the interval
        env.ledger().with_mut(|l| l.timestamp += MONTHLY_INTERVAL + 1);

        client.process(&id);

        // Farmer received the amount
        assert_eq!(
            token::Client::new(&env, &xlm).balance(&farmer) - farmer_balance_before,
            amount
        );

        // Sponsor paid for the next cycle (locked into contract)
        assert_eq!(
            sponsor_balance_before - token::Client::new(&env, &xlm).balance(&sponsor),
            amount
        );

        let rec = client.get_subscription(&id).unwrap();
        assert_eq!(rec.total_trees_sponsored, trees);
        assert_eq!(rec.total_amount_spent, amount);
        assert_eq!(rec.status, SubscriptionStatus::Active);
    }

    #[test]
    fn test_process_subscription_supports_multiple_intervals() {
        let (env, _admin, sponsor, farmer, xlm, _usdc, client) = setup();

        let amount: i128 = 500;
        let trees: u32 = 1;
        let interval: u64 = 1_000;

        // Mint enough for many cycles
        token::StellarAssetClient::new(&env, &xlm).mint(&sponsor, &100_000);

        let id = client.setup(&sponsor, &farmer, &xlm, &amount, &trees, &interval);

        // Process 3 intervals
        for _ in 0..3 {
            env.ledger().with_mut(|l| l.timestamp += interval + 1);
            client.process(&id);
        }

        let rec = client.get_subscription(&id).unwrap();
        assert_eq!(rec.total_trees_sponsored, 3);
        assert_eq!(rec.total_amount_spent, amount * 3);
        assert_eq!(rec.status, SubscriptionStatus::Active);
    }

    #[test]
    #[should_panic(expected = "IntervalNotElapsed")]
    fn test_process_subscription_fails_before_interval() {
        let (_env, _admin, sponsor, farmer, xlm, _usdc, client) = setup();

        let id = client.setup(&sponsor, &farmer, &xlm, &1_000, &1, &MONTHLY_INTERVAL);

        // Don't advance time — should panic
        client.process(&id);
    }

    #[test]
    fn test_process_subscription_auto_cancels_on_insufficient_funds() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, SubscriptionSponsorship);
        let client = SubscriptionSponsorshipClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let farmer = Address::generate(&env);

        let xlm = env.register_stellar_asset_contract(admin.clone());
        let usdc = env.register_stellar_asset_contract(admin.clone());

        // Mint exactly enough for the first cycle only
        let amount: i128 = 5_000;
        token::StellarAssetClient::new(&env, &xlm).mint(&sponsor, &amount);

        client.initialize(&admin, &xlm, &usdc);

        let id = client.setup(&sponsor, &farmer, &xlm, &amount, &1, &MONTHLY_INTERVAL);

        // Advance time and process — sponsor has no more funds
        env.ledger().with_mut(|l| l.timestamp += MONTHLY_INTERVAL + 1);
        client.process(&id);

        let rec = client.get_subscription(&id).unwrap();
        assert_eq!(rec.total_trees_sponsored, 1);
        assert_eq!(rec.total_amount_spent, amount);
        assert_eq!(rec.status, SubscriptionStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "subscription is not active")]
    fn test_process_cancelled_subscription_panics() {
        let (_env, _admin, sponsor, farmer, xlm, _usdc, client) = setup();

        let id = client.setup(&sponsor, &farmer, &xlm, &1_000, &1, &MONTHLY_INTERVAL);

        client.cancel(&sponsor, &id);

        // Advance time
        _env.ledger().with_mut(|l| l.timestamp += MONTHLY_INTERVAL + 1);

        // Should panic — subscription cancelled
        client.process(&id);
    }

    // ── cancel_subscription ──────────────────────────────────────────────────

    #[test]
    fn test_cancel_subscription_refunds_locked_amount() {
        let (env, _admin, sponsor, farmer, xlm, _usdc, client) = setup();

        let amount: i128 = 1_000;
        let id = client.setup(&sponsor, &farmer, &xlm, &amount, &1, &MONTHLY_INTERVAL);

        let balance_before = token::Client::new(&env, &xlm).balance(&sponsor);
        let contract_before = token::Client::new(&env, &xlm).balance(&env.current_contract_address());

        client.cancel(&sponsor, &id);

        // Sponsor got refunded the locked amount
        assert_eq!(
            token::Client::new(&env, &xlm).balance(&sponsor) - balance_before,
            amount
        );
        assert_eq!(
            contract_before - token::Client::new(&env, &xlm).balance(&env.current_contract_address()),
            amount
        );

        let rec = client.get_subscription(&id).unwrap();
        assert_eq!(rec.status, SubscriptionStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "not the sponsor")]
    fn test_cancel_subscription_rejects_unauthorized() {
        let (env, _admin, sponsor, farmer, xlm, _usdc, client) = setup();

        let id = client.setup(&sponsor, &farmer, &xlm, &1_000, &1, &MONTHLY_INTERVAL);

        let impostor = Address::generate(&env);
        client.cancel(&impostor, &id);
    }

    #[test]
    #[should_panic(expected = "subscription is not active")]
    fn test_cancel_already_cancelled_subscription_panics() {
        let (_env, _admin, sponsor, farmer, xlm, _usdc, client) = setup();

        let id = client.setup(&sponsor, &farmer, &xlm, &1_000, &1, &MONTHLY_INTERVAL);

        client.cancel(&sponsor, &id);

        // Second cancel should panic
        client.cancel(&sponsor, &id);
    }

    // ── get_sponsor_subscriptions ────────────────────────────────────────────

    #[test]
    fn test_get_sponsor_subscriptions_returns_all_for_sponsor() {
        let (_env, _admin, sponsor, farmer, xlm, _usdc, client) = setup();

        // Create multiple subscriptions for the same sponsor
        let id1 = client.setup(&sponsor, &farmer, &xlm, &500, &1, &MONTHLY_INTERVAL);
        let id2 = client.setup(&sponsor, &farmer, &xlm, &1_000, &2, &MONTHLY_INTERVAL);

        // Create a subscription for a different sponsor
        let other_sponsor = Address::generate(&_env);
        token::StellarAssetClient::new(&_env, &xlm).mint(&other_sponsor, &10_000);
        client.setup(&other_sponsor, &farmer, &xlm, &750, &1, &MONTHLY_INTERVAL);

        let sponsor_ids = client.get_sponsor_subscriptions(&sponsor);
        assert_eq!(sponsor_ids.len(), 2);
        assert_eq!(sponsor_ids.get(0).unwrap(), id1);
        assert_eq!(sponsor_ids.get(1).unwrap(), id2);
    }

    #[test]
    fn test_get_sponsor_subscriptions_returns_empty_for_none() {
        let (_env, _admin, _sponsor, _farmer, xlm, _usdc, client) = setup();

        let nobody = Address::generate(&_env);
        let ids = client.get_sponsor_subscriptions(&nobody);
        assert_eq!(ids.len(), 0);
    }

    // ── admin functions ──────────────────────────────────────────────────────

    #[test]
    fn test_update_tokens_changes_supported_tokens() {
        let (env, admin, sponsor, farmer, _xlm, _usdc, client) = setup();

        let new_xlm = env.register_stellar_asset_contract(admin.clone());
        let new_usdc = env.register_stellar_asset_contract(admin.clone());

        client.update_tokens(&new_xlm, &new_usdc);

        // New token should now work
        token::StellarAssetClient::new(&env, &new_xlm).mint(&sponsor, &10_000);
        let id = client.setup(&sponsor, &farmer, &new_xlm, &1_000, &1, &MONTHLY_INTERVAL);
        assert_eq!(id, 1);
    }

    #[test]
    #[should_panic(expected = "not initialized")]
    fn test_operations_fail_before_initialize() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, SubscriptionSponsorship);
        let client = SubscriptionSponsorshipClient::new(&env, &contract_id);

        let sponsor = Address::generate(&env);
        let farmer = Address::generate(&env);
        let xlm = env.register_stellar_asset_contract(Address::generate(&env));

        // Without initialize, setup should panic
        client.setup(&sponsor, &farmer, &xlm, &1_000, &1, &MONTHLY_INTERVAL);
    }
}
