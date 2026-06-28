#![no_std]

//! Species Registry — Closes #554
//!
//! On-chain catalogue of tree species with FAO/IPCC Tier-1 CO₂ sequestration
//! rates.  The off-chain seeder (`scripts/seed-species.mjs`) calls
//! `register_species` for each row in `data/fao_co2_rates.csv`.
//!
//! # Storage layout
//!   Instance:
//!     ADMIN          — Address   (admin allowed to register/update species)
//!   Persistent (keyed by species slug Symbol):
//!     species:<slug> — SpeciesRecord
//!
//! # Functions
//!   initialize(admin)
//!   register_species(slug, co2_scaled, maturity_years)   — admin only
//!   get_species(slug) -> SpeciesRecord
//!   get_co2_rate(slug) -> i128   (co2_kg_per_year × 100)

use harvesta_errors::HarvestaError;
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, Address, Env, String,
    Symbol,
};

// ── Types ─────────────────────────────────────────────────────────────────────

/// On-chain record for a single species.
/// `co2_scaled` = kg CO₂ per year × 100 (integer, avoids floats on-chain).
/// Example: 22.00 kg/yr  →  co2_scaled = 2200
#[contracttype]
#[derive(Clone, Debug)]
pub struct SpeciesRecord {
    pub slug: Symbol,
    /// CO₂ kg/year × 100 (scaled integer)
    pub co2_scaled: i128,
    /// Years to biomass maturity
    pub maturity_years: u32,
    /// Ledger timestamp of last update
    pub updated_at: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

fn admin_key() -> Symbol {
    symbol_short!("ADMIN")
}

fn species_key(slug: &Symbol) -> (Symbol, Symbol) {
    (symbol_short!("SPECIES"), slug.clone())
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct SpeciesRegistry;

#[contractimpl]
impl SpeciesRegistry {
    /// One-time initialisation.  Must be called before any other function.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&admin_key()) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage().instance().set(&admin_key(), &admin);
    }

    /// Register or update a species.  Caller must be the stored admin.
    ///
    /// * `slug`          — short identifier, e.g. `Symbol::new(&env, "teak")`
    /// * `co2_scaled`    — kg CO₂ per year × 100  (positive integer)
    /// * `maturity_years`— years to biomass maturity
    pub fn register_species(
        env: Env,
        slug: Symbol,
        co2_scaled: i128,
        maturity_years: u32,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&admin_key())
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized));
        admin.require_auth();

        if co2_scaled <= 0 {
            panic_with_error!(&env, HarvestaError::Co2MustBePositive);
        }
        if maturity_years == 0 {
            panic_with_error!(&env, HarvestaError::MaturityYearsMustBePositive);
        }

        let record = SpeciesRecord {
            slug: slug.clone(),
            co2_scaled,
            maturity_years,
            updated_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&species_key(&slug), &record);

        env.events().publish(
            (symbol_short!("species"), symbol_short!("register")),
            (slug, co2_scaled, maturity_years),
        );
    }

    /// Retrieve the full record for a species slug.  Panics if not found.
    pub fn get_species(env: Env, slug: Symbol) -> SpeciesRecord {
        env.storage()
            .persistent()
            .get(&species_key(&slug))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::SpeciesNotFound))
    }

    /// Convenience: return only the scaled CO₂ rate for a species.
    pub fn get_co2_rate(env: Env, slug: Symbol) -> i128 {
        let record: SpeciesRecord = env
            .storage()
            .persistent()
            .get(&species_key(&slug))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::SpeciesNotFound));
        record.co2_scaled
    }

    /// Calculate carbon offset for a given species and tree count over a time period.
    ///
    /// Formula: (co2_kg_per_year × tree_count × years) / 100
    /// Returns offset in kg CO₂ (scaled by 100 for precision).
    ///
    /// * `slug` — species identifier
    /// * `tree_count` — number of trees
    /// * `years` — time period in years
    pub fn calculate_offset(env: Env, slug: Symbol, tree_count: i128, years: i128) -> i128 {
        let record: SpeciesRecord = env
            .storage()
            .persistent()
            .get(&species_key(&slug))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::SpeciesNotFound));

        if tree_count <= 0 {
            panic_with_error!(&env, HarvestaError::TreeCountMustBePositive);
        }
        if years <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        // offset = (co2_scaled × tree_count × years) / 100
        // co2_scaled is already ×100, so we divide by 100 to get actual kg
        let offset = record
            .co2_scaled
            .checked_mul(tree_count)
            .expect("offset calculation overflow")
            .checked_mul(years)
            .expect("offset calculation overflow")
            .checked_div(100)
            .expect("offset calculation division error");

        offset
    }

    /// Calculate carbon offset limited to species maturity period.
    /// Uses the minimum of requested years and species maturity_years.
    ///
    /// * `slug` — species identifier
    /// * `tree_count` — number of trees
    /// * `years` — time period in years
    pub fn calculate_offset_to_maturity(env: Env, slug: Symbol, tree_count: i128, years: i128) -> i128 {
        let record: SpeciesRecord = env
            .storage()
            .persistent()
            .get(&species_key(&slug))
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::SpeciesNotFound));

        if tree_count <= 0 {
            panic_with_error!(&env, HarvestaError::TreeCountMustBePositive);
        }
        if years <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        // Use minimum of requested years and maturity period
        let effective_years = if years as u32 > record.maturity_years {
            record.maturity_years as i128
        } else {
            years
        };

        // offset = (co2_scaled × tree_count × effective_years) / 100
        let offset = record
            .co2_scaled
            .checked_mul(tree_count)
            .expect("offset calculation overflow")
            .checked_mul(effective_years)
            .expect("offset calculation overflow")
            .checked_div(100)
            .expect("offset calculation division error");

        offset
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, Symbol};

    #[test]
    fn test_register_and_get() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let slug = Symbol::new(&env, "teak");
        client.register_species(&slug, &2200_i128, &20_u32);

        let record = client.get_species(&slug);
        assert_eq!(record.co2_scaled, 2200);
        assert_eq!(record.maturity_years, 20);
        assert_eq!(client.get_co2_rate(&slug), 2200);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #64)")]
    fn test_get_unknown_species_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let slug = Symbol::new(&env, "unknown");
        client.get_species(&slug);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #62)")]
    fn test_reject_zero_co2() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);
        client.register_species(&Symbol::new(&env, "bad"), &0_i128, &5_u32);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #63)")]
    fn test_reject_zero_maturity_years() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);
        client.register_species(&Symbol::new(&env, "bad"), &2200_i128, &0_u32);
    }

    // ── CO2 rate tests ─────────────────────────────────────────────────────────────

    #[test]
    fn test_get_co2_rate_returns_scaled_value() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Register teak: 22.00 kg/year → 2200 scaled
        let slug = Symbol::new(&env, "teak");
        client.register_species(&slug, &2200_i128, &20_u32);

        assert_eq!(client.get_co2_rate(&slug), 2200);
    }

    #[test]
    fn test_multiple_species_different_rates() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Register multiple species with different CO2 rates
        client.register_species(&Symbol::new(&env, "teak"), &2200_i128, &20_u32);      // 22.00 kg/year
        client.register_species(&Symbol::new(&env, "moringa"), &900_i128, &3_u32);     // 9.00 kg/year
        client.register_species(&Symbol::new(&env, "eucalyptus"), &3100_i128, &10_u32); // 31.00 kg/year
        client.register_species(&Symbol::new(&env, "bamboo"), &3500_i128, &5_u32);   // 35.00 kg/year

        assert_eq!(client.get_co2_rate(&Symbol::new(&env, "teak")), 2200);
        assert_eq!(client.get_co2_rate(&Symbol::new(&env, "moringa")), 900);
        assert_eq!(client.get_co2_rate(&Symbol::new(&env, "eucalyptus")), 3100);
        assert_eq!(client.get_co2_rate(&Symbol::new(&env, "bamboo")), 3500);
    }

    #[test]
    fn test_species_update_overwrites_previous() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let slug = Symbol::new(&env, "teak");
        client.register_species(&slug, &2200_i128, &20_u32);

        // Update with new values
        client.register_species(&slug, &2500_i128, &25_u32);

        let record = client.get_species(&slug);
        assert_eq!(record.co2_scaled, 2500);
        assert_eq!(record.maturity_years, 25);
        assert_eq!(client.get_co2_rate(&slug), 2500);
    }

    // ── Offset calculation tests ───────────────────────────────────────────────────

    #[test]
    fn test_calculate_offset_basic() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Teak: 22.00 kg/year → 2200 scaled
        let slug = Symbol::new(&env, "teak");
        client.register_species(&slug, &2200_i128, &20_u32);

        // 100 trees for 1 year: 22.00 * 100 * 1 = 2200 kg
        let offset = client.calculate_offset(&slug, &100, &1);
        assert_eq!(offset, 2200);
    }

    #[test]
    fn test_calculate_offset_multiple_years() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Teak: 22.00 kg/year → 2200 scaled
        let slug = Symbol::new(&env, "teak");
        client.register_species(&slug, &2200_i128, &20_u32);

        // 100 trees for 5 years: 22.00 * 100 * 5 = 11000 kg
        let offset = client.calculate_offset(&slug, &100, &5);
        assert_eq!(offset, 11000);
    }

    #[test]
    fn test_calculate_offset_different_species() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Register species with different rates
        client.register_species(&Symbol::new(&env, "teak"), &2200_i128, &20_u32);      // 22.00 kg/year
        client.register_species(&Symbol::new(&env, "moringa"), &900_i128, &3_u32);     // 9.00 kg/year
        client.register_species(&Symbol::new(&env, "bamboo"), &3500_i128, &5_u32);    // 35.00 kg/year

        // 50 trees for 2 years each
        let teak_offset = client.calculate_offset(&Symbol::new(&env, "teak"), &50, &2);
        let moringa_offset = client.calculate_offset(&Symbol::new(&env, "moringa"), &50, &2);
        let bamboo_offset = client.calculate_offset(&Symbol::new(&env, "bamboo"), &50, &2);

        // Teak: 22.00 * 50 * 2 = 2200 kg
        assert_eq!(teak_offset, 2200);
        // Moringa: 9.00 * 50 * 2 = 900 kg
        assert_eq!(moringa_offset, 900);
        // Bamboo: 35.00 * 50 * 2 = 3500 kg
        assert_eq!(bamboo_offset, 3500);
    }

    #[test]
    fn test_calculate_offset_large_scale() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Eucalyptus: 31.00 kg/year → 3100 scaled
        let slug = Symbol::new(&env, "eucalyptus");
        client.register_species(&slug, &3100_i128, &10_u32);

        // 10,000 trees for 10 years: 31.00 * 10000 * 10 = 3,100,000 kg
        let offset = client.calculate_offset(&slug, &10000, &10);
        assert_eq!(offset, 3100000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_calculate_offset_zero_tree_count_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let slug = Symbol::new(&env, "teak");
        client.register_species(&slug, &2200_i128, &20_u32);

        client.calculate_offset(&slug, &0, &5);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_calculate_offset_zero_years_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let slug = Symbol::new(&env, "teak");
        client.register_species(&slug, &2200_i128, &20_u32);

        client.calculate_offset(&slug, &100, &0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #64)")]
    fn test_calculate_offset_unknown_species_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        client.calculate_offset(&Symbol::new(&env, "unknown"), &100, &5);
    }

    // ── Offset to maturity tests ───────────────────────────────────────────────────

    #[test]
    fn test_calculate_offset_to_maturity_within_period() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Teak: 22.00 kg/year, 20 year maturity
        let slug = Symbol::new(&env, "teak");
        client.register_species(&slug, &2200_i128, &20_u32);

        // Request 5 years (within maturity): should use 5 years
        let offset = client.calculate_offset_to_maturity(&slug, &100, &5);
        // 22.00 * 100 * 5 = 11000 kg
        assert_eq!(offset, 11000);
    }

    #[test]
    fn test_calculate_offset_to_maturity_exceeds_period() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Moringa: 9.00 kg/year, 3 year maturity
        let slug = Symbol::new(&env, "moringa");
        client.register_species(&slug, &900_i128, &3_u32);

        // Request 10 years (exceeds maturity): should cap at 3 years
        let offset = client.calculate_offset_to_maturity(&slug, &100, &10);
        // 9.00 * 100 * 3 = 2700 kg (capped at maturity)
        assert_eq!(offset, 2700);
    }

    #[test]
    fn test_calculate_offset_to_maturity_exact_maturity() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Bamboo: 35.00 kg/year, 5 year maturity
        let slug = Symbol::new(&env, "bamboo");
        client.register_species(&slug, &3500_i128, &5_u32);

        // Request exactly 5 years (maturity period)
        let offset = client.calculate_offset_to_maturity(&slug, &50, &5);
        // 35.00 * 50 * 5 = 8750 kg
        assert_eq!(offset, 8750);
    }

    #[test]
    fn test_calculate_offset_to_maturity_long_lived_species() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Baobab: 8.00 kg/year, 50 year maturity
        let slug = Symbol::new(&env, "baobab");
        client.register_species(&slug, &800_i128, &50_u32);

        // Request 20 years (within 50 year maturity)
        let offset = client.calculate_offset_to_maturity(&slug, &200, &20);
        // 8.00 * 200 * 20 = 32000 kg
        assert_eq!(offset, 32000);

        // Request 100 years (exceeds 50 year maturity)
        let offset_capped = client.calculate_offset_to_maturity(&slug, &200, &100);
        // 8.00 * 200 * 50 = 80000 kg (capped at maturity)
        assert_eq!(offset_capped, 80000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_calculate_offset_to_maturity_zero_tree_count_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let slug = Symbol::new(&env, "teak");
        client.register_species(&slug, &2200_i128, &20_u32);

        client.calculate_offset_to_maturity(&slug, &0, &5);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn test_calculate_offset_to_maturity_zero_years_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let slug = Symbol::new(&env, "teak");
        client.register_species(&slug, &2200_i128, &20_u32);

        client.calculate_offset_to_maturity(&slug, &100, &0);
    }

    // ── Integration tests: species rates + offset calculation ─────────────────────

    #[test]
    fn test_full_species_lifecycle_with_offset() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Register a species
        let slug = Symbol::new(&env, "mahogany");
        client.register_species(&slug, &1800_i128, &25_u32); // 18.00 kg/year, 25 year maturity

        // Verify registration
        let record = client.get_species(&slug);
        assert_eq!(record.co2_scaled, 1800);
        assert_eq!(record.maturity_years, 25);

        // Calculate offset for various scenarios
        let offset_1yr = client.calculate_offset(&slug, &100, &1);
        let offset_5yr = client.calculate_offset(&slug, &100, &5);
        let offset_maturity = client.calculate_offset_to_maturity(&slug, &100, &30);

        // 18.00 * 100 * 1 = 1800 kg
        assert_eq!(offset_1yr, 1800);
        // 18.00 * 100 * 5 = 9000 kg
        assert_eq!(offset_5yr, 9000);
        // 18.00 * 100 * 25 = 45000 kg (capped at 25 year maturity)
        assert_eq!(offset_maturity, 45000);
    }

    #[test]
    fn test_compare_species_offset_efficiency() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Register species with different CO2 rates
        client.register_species(&Symbol::new(&env, "shea"), &700_i128, &20_u32);       // 7.00 kg/year
        client.register_species(&Symbol::new(&env, "pine"), &2500_i128, &15_u32);     // 25.00 kg/year
        client.register_species(&Symbol::new(&env, "bamboo"), &3500_i128, &5_u32);    // 35.00 kg/year

        // Compare offsets for same tree count and time period
        let tree_count = 100;
        let years = 10;

        let shea_offset = client.calculate_offset(&Symbol::new(&env, "shea"), &tree_count, &years);
        let pine_offset = client.calculate_offset(&Symbol::new(&env, "pine"), &tree_count, &years);
        let bamboo_offset = client.calculate_offset(&Symbol::new(&env, "bamboo"), &tree_count, &years);

        // Bamboo should have highest offset, Shea lowest
        assert!(bamboo_offset > pine_offset);
        assert!(pine_offset > shea_offset);

        // Verify exact values
        assert_eq!(shea_offset, 7000);    // 7.00 * 100 * 10
        assert_eq!(pine_offset, 25000);   // 25.00 * 100 * 10
        assert_eq!(bamboo_offset, 35000); // 35.00 * 100 * 10
    }

    #[test]
    fn test_offset_calculation_with_fractional_co2_rates() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SpeciesRegistry);
        let client = SpeciesRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Register species with fractional CO2 rate (e.g., 12.50 kg/year → 1250 scaled)
        let slug = Symbol::new(&env, "custom");
        client.register_species(&slug, &1250_i128, &10_u32);

        // 100 trees for 1 year: 12.50 * 100 * 1 = 1250 kg
        let offset = client.calculate_offset(&slug, &100, &1);
        assert_eq!(offset, 1250);

        // 50 trees for 3 years: 12.50 * 50 * 3 = 1875 kg
        let offset_3yr = client.calculate_offset(&slug, &50, &3);
        assert_eq!(offset_3yr, 1875);
    }
}
