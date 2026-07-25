#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct SpeciesRate {
    pub slug: Symbol,
    /// kg CO₂/year × 100 (avoids floats on-chain). Example: 22 kg/yr → 2200
    pub co2_scaled: i128,
    pub maturity_years: u32,
    pub updated_at: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Admin,
    Rate(Symbol),
    TotalOffset(Address),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct CarbonCredits;

#[contractimpl]
impl CarbonCredits {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Admin-only: register or update a species sequestration rate.
    pub fn set_rate(env: Env, slug: Symbol, co2_scaled: i128, maturity_years: u32) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();

        if co2_scaled <= 0 {
            panic!("co2_scaled must be positive");
        }
        if maturity_years == 0 {
            panic!("maturity_years must be > 0");
        }

        let rate = SpeciesRate {
            slug: slug.clone(),
            co2_scaled,
            maturity_years,
            updated_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&DataKey::Rate(slug), &rate);
    }

    pub fn get_rate(env: Env, slug: Symbol) -> SpeciesRate {
        env.storage()
            .persistent()
            .get(&DataKey::Rate(slug))
            .expect("species not found")
    }

    /// Returns lifetime grams CO₂ for one tree of `slug` at `age_years`.
    /// Capped at maturity — a tree does not sequester more after it matures.
    ///
    /// Formula: min(age, maturity) × (co2_scaled × 10)
    ///   co2_scaled is kg/yr × 100; × 10 converts to grams/yr (÷100 × 1000).
    pub fn estimate_offset(env: Env, slug: Symbol, age_years: u32) -> u64 {
        let rate: SpeciesRate = env
            .storage()
            .persistent()
            .get(&DataKey::Rate(slug))
            .expect("species not found");

        let capped_years = age_years.min(rate.maturity_years) as i128;
        let grams_per_year: i128 = rate.co2_scaled * 10;
        (capped_years * grams_per_year) as u64
    }

    /// Admin-only: accumulate CO₂ offset credits for a sponsor.
    pub fn record_credit(
        env: Env,
        sponsor: Address,
        slug: Symbol,
        tree_count: u32,
        age_years: u32,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();

        if tree_count == 0 {
            panic!("tree_count must be > 0");
        }

        let per_tree = Self::estimate_offset(env.clone(), slug, age_years);
        let delta = per_tree * tree_count as u64;

        let key = DataKey::TotalOffset(sponsor.clone());
        let current: u64 = env.storage().persistent().get(&key).unwrap_or(0u64);
        env.storage().persistent().set(&key, &(current + delta));

        env.events().publish(
            (symbol_short!("credit"), symbol_short!("recorded")),
            (sponsor, delta),
        );
    }

    /// Returns the total accumulated grams CO₂ offset for a sponsor.
    /// Returns 0 for an unknown sponsor.
    pub fn total_offset_for_sponsor(env: Env, sponsor: Address) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::TotalOffset(sponsor))
            .unwrap_or(0u64)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, Symbol};

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CarbonCredits);
        let client = CarbonCreditsClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_init_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CarbonCredits);
        let client = CarbonCreditsClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        client.initialize(&admin);
    }

    #[test]
    fn test_set_and_get_rate() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CarbonCredits);
        let client = CarbonCreditsClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        let rate = client.get_rate(&slug);
        assert_eq!(rate.co2_scaled, 2200);
        assert_eq!(rate.maturity_years, 20);
    }

    #[test]
    fn test_estimate_offset_under_maturity() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CarbonCredits);
        let client = CarbonCreditsClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        // teak: 22 kg/yr → co2_scaled=2200, maturity=20yr
        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        // age=10yr < maturity=20yr → 10 × 2200 × 10 = 220_000 g
        let result = client.estimate_offset(&slug, &10_u32);
        assert_eq!(result, 220_000u64);
    }

    #[test]
    fn test_estimate_offset_at_maturity() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CarbonCredits);
        let client = CarbonCreditsClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        // age=20yr = maturity=20yr → 20 × 2200 × 10 = 440_000 g
        let result = client.estimate_offset(&slug, &20_u32);
        assert_eq!(result, 440_000u64);
    }

    #[test]
    fn test_estimate_offset_over_maturity() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CarbonCredits);
        let client = CarbonCreditsClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        // age=50yr > maturity=20yr → capped at 20 → 440_000 g (same as at_maturity)
        let result = client.estimate_offset(&slug, &50_u32);
        assert_eq!(result, 440_000u64);
    }

    #[test]
    #[should_panic(expected = "species not found")]
    fn test_estimate_unknown_slug_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CarbonCredits);
        let client = CarbonCreditsClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        client.estimate_offset(&Symbol::new(&env, "unknown"), &5_u32);
    }

    #[test]
    fn test_record_credit_accumulates() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CarbonCredits);
        let client = CarbonCreditsClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        let sponsor = Address::generate(&env);

        // First call: 5 trees × 10yr → 5 × 220_000 = 1_100_000 g
        client.record_credit(&sponsor, &slug, &5_u32, &10_u32);
        assert_eq!(client.total_offset_for_sponsor(&sponsor), 1_100_000u64);

        // Second call: 3 trees × 10yr → 3 × 220_000 = 660_000 g
        client.record_credit(&sponsor, &slug, &3_u32, &10_u32);
        assert_eq!(client.total_offset_for_sponsor(&sponsor), 1_760_000u64);
    }

    #[test]
    #[should_panic(expected = "tree_count must be > 0")]
    fn test_record_credit_zero_tree_count_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CarbonCredits);
        let client = CarbonCreditsClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let slug = Symbol::new(&env, "teak");
        client.set_rate(&slug, &2200_i128, &20_u32);

        let sponsor = Address::generate(&env);
        client.record_credit(&sponsor, &slug, &0_u32, &10_u32);
    }

    #[test]
    fn test_total_offset_unknown_sponsor_zero() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, CarbonCredits);
        let client = CarbonCreditsClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sponsor = Address::generate(&env);
        assert_eq!(client.total_offset_for_sponsor(&sponsor), 0u64);
    }
}
