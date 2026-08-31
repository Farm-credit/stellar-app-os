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
    pub fn register_species(env: Env, slug: Symbol, co2_scaled: i128, maturity_years: u32) {
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

        env.storage().persistent().set(&species_key(&slug), &record);

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
}
