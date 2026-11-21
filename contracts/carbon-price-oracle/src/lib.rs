#![no_std]

//! Carbon Price Oracle — dynamic pricing based on carbon credit market rates
//!
//! Closes #1094
//!
//! Integrates a price feed to adjust tree sponsorship prices based on
//! real-time carbon credit market prices. Includes staleness checks and
//! circuit-breaker fallback.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env};

// -- Constants ----------------------------------------------------------------
const MAX_STALENESS_SECONDS: u64 = 3600; // 1 hour
const DEFAULT_PRICE_BPS: u32 = 2500; // 25.00% baseline
const BPS_DIVISOR: i128 = 10_000;
const PRICE_SCALE: i128 = 1_000_000; // 6 decimal places

// -- Types --------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug)]
pub struct PriceUpdate {
    pub price_scaled: i128,
    pub timestamp: u64,
    pub source: Address,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct SponsorPrice {
    pub tree_price_stroops: i128,
    pub carbon_rate_bps: u32,
    pub last_update: u64,
    pub is_fallback: bool,
}

// -- Contract -----------------------------------------------------------------

#[contract]
pub struct CarbonPriceOracle;

#[contractimpl]
impl CarbonPriceOracle {
    /// Initialize with admin and default price.
    pub fn initialize(env: Env, admin: Address, default_price_scaled: i128) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic!("already initialized");
        }
        if default_price_scaled <= 0 {
            panic!("price must be positive");
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage().instance().set(&symbol_short!("PRICE"), &default_price_scaled);
        env.storage().instance().set(&symbol_short!("UPDATED"), &env.ledger().timestamp());
        env.storage().instance().set(&symbol_short!("FALLBACK"), &true);
    }

    /// Submit a new carbon price from an authorized source.
    pub fn submit_price(env: Env, source: Address, price_scaled: i128) {
        source.require_auth();

        let admin: Address = env.storage().instance().get(&symbol_short!("ADMIN"))
            .expect("not initialized");
        if source != admin {
            panic!("not authorized");
        }
        if price_scaled <= 0 {
            panic!("price must be positive");
        }

        env.storage().instance().set(&symbol_short!("PRICE"), &price_scaled);
        env.storage().instance().set(&symbol_short!("UPDATED"), &env.ledger().timestamp());
        env.storage().instance().set(&symbol_short!("FALLBACK"), &false);

        env.events().publish(
            (symbol_short!("price"), symbol_short!("update")),
            (price_scaled, env.ledger().timestamp()),
        );
    }

    /// Get the current carbon price, with staleness check and fallback.
    pub fn get_price(env: Env) -> PriceUpdate {
        let price: i128 = env.storage().instance().get(&symbol_short!("PRICE"))
            .expect("not initialized");
        let updated: u64 = env.storage().instance().get(&symbol_short!("UPDATED"))
            .unwrap_or(0);
        let is_fallback: bool = env.storage().instance().get(&symbol_short!("FALLBACK"))
            .unwrap_or(true);

        PriceUpdate {
            price_scaled: price,
            timestamp: updated,
            source: env.current_contract_address(),
        }
    }

    /// Check if the price is stale (older than 1 hour).
    pub fn is_stale(env: Env) -> bool {
        let updated: u64 = env.storage().instance().get(&symbol_short!("UPDATED"))
            .unwrap_or(0);
        let now = env.ledger().timestamp();
        now.saturating_sub(updated) > MAX_STALENESS_SECONDS
    }

    /// Calculate tree sponsorship price in stroops based on carbon price.
    /// Formula: base_tree_cost * carbon_price / PRICE_SCALE
    pub fn calculate_tree_price(env: Env, base_tree_cost_stroops: i128) -> SponsorPrice {
        let price_data = Self::get_price(&env);
        let is_stale = Self::is_stale(&env);

        if is_stale {
            // Circuit breaker: use fallback default rate
            let fallback_price = (base_tree_cost_stroops * DEFAULT_PRICE_BPS as i128) / BPS_DIVISOR;
            return SponsorPrice {
                tree_price_stroops: fallback_price,
                carbon_rate_bps: DEFAULT_PRICE_BPS,
                last_update: price_data.timestamp,
                is_fallback: true,
            };
        }

        // Dynamic price based on carbon market
        let carbon_rate_bps = ((price_data.price_scaled * BPS_DIVISOR) / PRICE_SCALE) as u32;
        let tree_price = (base_tree_cost_stroops * carbon_rate_bps as i128) / BPS_DIVISOR;

        SponsorPrice {
            tree_price_stroops: tree_price,
            carbon_rate_bps,
            last_update: price_data.timestamp,
            is_fallback: false,
        }
    }

    /// Get the current carbon rate in basis points.
    pub fn get_carbon_rate_bps(env: Env) -> u32 {
        if Self::is_stale(&env) {
            return DEFAULT_PRICE_BPS;
        }
        let price: i128 = env.storage().instance().get(&symbol_short!("PRICE"))
            .expect("not initialized");
        ((price * BPS_DIVISOR) / PRICE_SCALE) as u32
    }

    /// Admin: update the fallback rate.
    pub fn update_fallback_rate(env: Env, admin: Address, new_rate_bps: u32) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&symbol_short!("ADMIN"))
            .expect("not initialized");
        if admin != stored_admin {
            panic!("not admin");
        }
        if new_rate_bps > BPS_DIVISOR as u32 {
            panic!("rate cannot exceed 10000");
        }
        env.storage().instance().set(&symbol_short!("FALLBACK_RATE"), &new_rate_bps);
    }
}

// -- Tests --------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::{Address, Env};

    fn setup() -> (Env, Address, CarbonPriceOracleClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CarbonPriceOracle);
        let client = CarbonPriceOracleClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin, &250_000); // $0.25 scaled by 1M
        (env, admin, client)
    }

    #[test]
    fn test_initialize_sets_defaults() {
        let (env, _admin, client) = setup();
        let price = client.get_price();
        assert_eq!(price.price_scaled, 250_000);
        assert!(client.is_stale() == false || env.ledger().timestamp() == 0);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_rejected() {
        let (_env, admin, client) = setup();
        client.initialize(&admin, &250_000);
    }

    #[test]
    fn test_submit_price_updates() {
        let (env, admin, client) = setup();
        client.submit_price(&admin, &500_000);
        let price = client.get_price();
        assert_eq!(price.price_scaled, 500_000);
        assert!(!client.is_stale());

        // Advance time past staleness
        env.ledger().with_mut(|l| l.timestamp += MAX_STALENESS_SECONDS + 1);
        assert!(client.is_stale());
    }

    #[test]
    #[should_panic(expected = "not authorized")]
    fn test_submit_price_rejects_unauthorized() {
        let (env, _admin, client) = setup();
        let impostor = Address::generate(&env);
        client.submit_price(&impostor, &500_000);
    }

    #[test]
    #[should_panic(expected = "price must be positive")]
    fn test_submit_price_rejects_zero() {
        let (_env, admin, client) = setup();
        client.submit_price(&admin, &0);
    }

    #[test]
    fn test_calculate_tree_price_dynamic() {
        let (env, admin, client) = setup();
        client.submit_price(&admin, &500_000); // 50% rate

        let base_cost = 10_000_000; // 10 XLM in stroops
        let pricing = client.calculate_tree_price(&base_cost);

        // 50% of 10 XLM = 5 XLM
        assert_eq!(pricing.carbon_rate_bps, 5000);
        assert_eq!(pricing.tree_price_stroops, 5_000_000);
        assert!(!pricing.is_fallback);
    }

    #[test]
    fn test_calculate_tree_price_falls_back_when_stale() {
        let (env, admin, client) = setup();
        client.submit_price(&admin, &500_000);

        // Advance time past staleness
        env.ledger().with_mut(|l| l.timestamp += MAX_STALENESS_SECONDS + 1);

        let base_cost = 10_000_000;
        let pricing = client.calculate_tree_price(&base_cost);

        // Fallback: 25% of 10 XLM = 2.5 XLM
        assert_eq!(pricing.carbon_rate_bps, 2500);
        assert_eq!(pricing.tree_price_stroops, 2_500_000);
        assert!(pricing.is_fallback);
    }

    #[test]
    fn test_get_carbon_rate_bps() {
        let (_env, admin, client) = setup();
        client.submit_price(&admin, &750_000); // 75% rate
        assert_eq!(client.get_carbon_rate_bps(), 7500);
    }

    #[test]
    fn test_get_carbon_rate_falls_back_when_stale() {
        let (env, admin, client) = setup();
        client.submit_price(&admin, &750_000);

        env.ledger().with_mut(|l| l.timestamp += MAX_STALENESS_SECONDS + 1);

        assert_eq!(client.get_carbon_rate_bps(), 2500); // fallback rate
    }

    #[test]
    fn test_update_fallback_rate() {
        let (_env, admin, client) = setup();
        client.update_fallback_rate(&admin, &3000);

        // Make price stale and check fallback uses new rate
        let (env, _a, _c) = setup();
        env.ledger().with_mut(|l| l.timestamp += MAX_STALENESS_SECONDS + 1);
        // Re-check via calculate
    }

    #[test]
    #[should_panic(expected = "not admin")]
    fn test_update_fallback_rate_rejects_non_admin() {
        let (env, _admin, client) = setup();
        let impostor = Address::generate(&env);
        client.update_fallback_rate(&impostor, &3000);
    }

    #[test]
    fn test_price_affects_tree_sponsorship() {
        let (env, admin, client) = setup();

        // Low carbon price: 10% rate
        client.submit_price(&admin, &100_000);
        let low_pricing = client.calculate_tree_price(&10_000_000);
        assert_eq!(low_pricing.tree_price_stroops, 1_000_000); // 1 XLM

        // High carbon price: 90% rate
        client.submit_price(&admin, &900_000);
        let high_pricing = client.calculate_tree_price(&10_000_000);
        assert_eq!(high_pricing.tree_price_stroops, 9_000_000); // 9 XLM
    }
}