#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, panic_with_error,
    symbol_short, Address, Env, IntoVal, Symbol, Val, Vec,
};
use harvesta_errors::HarvestaError;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum TreeRegistryError {
    NotFound = 85,
    InvalidStatus = 86,
    NotAuthorized = 87,
    SpeciesNotFound = 88,
    SpeciesAlreadyExists = 89,
    InvalidSpeciesName = 90,
    BatchTooLarge = 88,
    BatchSizeMismatch = 89,
    /// The tree registry has reached the maximum `u64` tree-id capacity and can
    /// no longer mint new trees.
    ContractFull = 91,
}

const ONE_YEAR_SECS: u64 = 31_536_000;
const CO2_KG_PER_YEAR: i128 = 48;
const DEFAULT_PERSISTENT_TTL: u32 = 1_576_800;

/// Represents the biological health / survival state of a tree.
/// Independent of the lifecycle status (`TreeStatus`).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum TreeHealth {
    /// The tree is alive and thriving.
    Healthy,
    /// The tree shows signs of stress or disease but is not yet dead.
    Struggling,
    /// The tree has died and no longer sequesters carbon.
    Dead,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum TreeStatus {
    Planted,
    Verified,
    Matured,
    Rejected,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct TreeRecord {
    pub id: u64,
    pub species: soroban_sdk::String,
    pub sponsor: Address,
    pub planter: Address,
    pub region: soroban_sdk::String,
    pub planted_at: u64,
    pub status: TreeStatus,
    pub health: Option<TreeHealth>,
    pub notes_hash: Option<soroban_sdk::String>,
    pub milestone_claims: u32,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PlanterMetrics {
    pub trees_completed: u64,
    pub avg_completion_time: u64,
    pub success_rate: u64,
    pub current_bond_locked: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct SpeciesInfo {
    pub co2_scaled: i128,
    pub maturity_years: u32,
    pub updated_at: u64,
}

#[contract]
pub struct TreeRegistry;

#[contractimpl]
impl TreeRegistry {
    pub fn initialize(env: Env, admin: Address, escrow: Address) {
        if env.storage().instance().has(&symbol_short!("ADMIN")) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage().instance().set(&symbol_short!("ADMIN"), &admin);
        env.storage().instance().set(&symbol_short!("ESCROW"), &escrow);
        env.storage().instance().set(&symbol_short!("TREECOUNT"), &0u64);
        env.storage().instance().set(&symbol_short!("PAUSED"), &false);
        env.storage().instance().set(&symbol_short!("VERIFIERS"), &Vec::<Address>::new(&env));
    }

    pub fn mint_tree(
        env: Env,
        sponsor: Address,
        species: soroban_sdk::String,
        region: soroban_sdk::String,
        planter: Address,
    ) -> u64 {
        Self::assert_not_paused(&env);
        Self::require_escrow(&env);

        let count: u64 = env
            .storage()
            .instance()
            .get(&symbol_short!("TREECOUNT"))
            .unwrap_or(0);

        // Edge case: the tree ID counter has reached its maximum value. The next
        // (i.e. this) mint would overflow `u64`. Reject the attempt up front with
        // a descriptive error instead of panicking on `count + 1`, and surface a
        // `ContractFull` event so indexers can observe that the registry is full.
        if count == u64::MAX {
            env.events().publish((Symbol::new(&env, "ContractFull"), count), ());
            panic_with_error!(&env, TreeRegistryError::ContractFull);
        }

        let tree_id = count;

        let record = TreeRecord {
            id: tree_id,
            species: species.clone(),
            sponsor: sponsor.clone(),
            planter: planter.clone(),
            region: region.clone(),
            planted_at: env.ledger().timestamp(),
            status: TreeStatus::Planted,
            health: None,
            notes_hash: None,
            milestone_claims: 0,
        };

        env.storage().persistent().set(&Self::tree_key(env, tree_id), &record);
        Self::extend_ttl(env, &Self::tree_key(env, tree_id));
        Self::record_status(&env, tree_id, TreeStatus::Planted);

        let mut planter_trees: Vec<u64> = env.storage().persistent().get(&Self::planter_key(&env, &planter)).unwrap_or_else(|| Vec::new(&env));
        planter_trees.push_back(tree_id);
        env.storage().persistent().set(&Self::planter_key(&env, &planter), &planter_trees);
        Self::extend_ttl(&env, &Self::planter_key(&env, &planter));

        env.storage()
            .instance()
            .set(&symbol_short!("TREECOUNT"), &count.checked_add(1).expect("tree count overflow"));

        let mut sponsor_trees: Vec<u64> = env
            .storage()
            .persistent()
            .get(&Self::sponsor_key(env, &sponsor))
            .unwrap_or_else(|| Vec::new(&env));
        sponsor_trees.push_back(tree_id);
        env.storage().persistent().set(&Self::sponsor_key(env, &sponsor), &sponsor_trees);
        Self::extend_ttl(env, &Self::sponsor_key(env, &sponsor));

        let mut species_list: Vec<soroban_sdk::String> = env
            .storage()
            .instance()
            .get(&Self::species_list_key(env))
            .unwrap_or_else(|| Vec::new(&env));

        if !species_list.contains(&species) {
            species_list.push_back(species.clone());
            env.storage().instance().set(&Self::species_list_key(env), &species_list);
        }

        let mut species_trees: Vec<u64> = env
            .storage()
            .persistent()
            .get(&Self::species_trees_key(env, &species))
            .unwrap_or_else(|| Vec::new(&env));
        species_trees.push_back(tree_id);
        env.storage().persistent().set(&Self::species_trees_key(env, &species), &species_trees);
        Self::extend_ttl(env, &Self::species_trees_key(env, &species));

        let mut species_region_trees: Vec<u64> = env
            .storage()
            .persistent()
            .get(&Self::species_region_key(env, &species, &region))
            .unwrap_or_else(|| Vec::new(&env));
        species_region_trees.push_back(tree_id);
        env.storage().persistent().set(&Self::species_region_key(env, &species, &region), &species_region_trees);
        Self::extend_ttl(env, &Self::species_region_key(env, &species, &region));

        let mut species_status_trees: Vec<u64> = env
            .storage()
            .persistent()
            .get(&Self::species_status_key(env, &species, &TreeStatus::Planted))
            .unwrap_or_else(|| Vec::new(&env));
        species_status_trees.push_back(tree_id);
        env.storage().persistent().set(&Self::species_status_key(env, &species, &TreeStatus::Planted), &species_status_trees);
        Self::extend_ttl(env, &Self::species_status_key(env, &species, &TreeStatus::Planted));

        let mut region_species: Vec<soroban_sdk::String> = env
            .storage()
            .persistent()
            .get(&Self::region_species_key(env, &region))
            .unwrap_or_else(|| Vec::new(&env));
        if !region_species.contains(&species) {
            region_species.push_back(species.clone());
        }
        env.storage().persistent().set(&Self::region_species_key(env, &region), &region_species);
        Self::extend_ttl(env, &Self::region_species_key(env, &region));

        env.events().publish(
            (Symbol::new(&env, "TreeMinted"), tree_id),
            (sponsor, species, region, planter),
        );

        tree_id
    }

    pub fn add_verifier(env: Env, verifier: Address) {
        Self::require_admin(&env);
        let mut verifiers: Vec<Address> = env
            .storage()
            .instance()
            .get(&symbol_short!("VERIFIERS"))
            .unwrap_or_else(|| Vec::new(&env));
        if !verifiers.contains(&verifier) {
            verifiers.push_back(verifier.clone());
            env.storage().instance().set(&symbol_short!("VERIFIERS"), &verifiers);
            env.events().publish((Symbol::new(&env, "VerifierAdded"),), verifier);
        }
    }

    pub fn remove_verifier(env: Env, verifier: Address) {
        Self::require_admin(&env);
        let verifiers: Vec<Address> = env
            .storage()
            .instance()
            .get(&symbol_short!("VERIFIERS"))
            .unwrap_or_else(|| Vec::new(&env));
        let mut new_verifiers = Vec::new(&env);
        for v in verifiers.iter() {
            if v != verifier {
                new_verifiers.push_back(v.clone());
            }
        }
        env.storage().instance().set(&symbol_short!("VERIFIERS"), &new_verifiers);
        env.events().publish((Symbol::new(&env, "VerifierRemoved"),), verifier);
    }

    pub fn get_verifiers(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&symbol_short!("VERIFIERS"))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_planter_score(env: Env, planter: Address) -> u64 {
        env.storage()
            .persistent()
            .get(&Self::planter_score_key(env, &planter))
            .unwrap_or(0)
    }

    pub fn verify_tree(
        env: Env,
        verifier: Address,
        tree_id: u64,
        approved: bool,
        notes_hash: Option<soroban_sdk::String>,
    ) {
        Self::assert_not_paused(&env);
        Self::require_verifier(&env, &verifier);

        let tree_key = Self::tree_key(env, tree_id);
        let mut tree_record: TreeRecord = env
            .storage()
            .persistent()
            .get(&tree_key)
            .unwrap_or_else(|| panic_with_error!(&env, TreeRegistryError::NotFound));

        if tree_record.status != TreeStatus::Planted {
            panic_with_error!(&env, TreeRegistryError::InvalidStatus);
        }

        tree_record.notes_hash = notes_hash.clone();

        if approved {
            tree_record.status = TreeStatus::Verified;

            let score_key = Self::planter_score_key(env, &tree_record.planter);
            let current_score: u64 = env.storage().persistent().get(&score_key).unwrap_or(0);
            env.storage().persistent().set(&score_key, &(current_score + 1));
            Self::extend_ttl(env, &score_key);

            let escrow: Address = env
                .storage()
                .instance()
                .get(&symbol_short!("ESCROW"))
                .unwrap();

            #[allow(dead_code)]
            #[contractclient(name = "EscrowClient")]
            trait EscrowTrait {
                fn release(env: Env, tree_id: u64);
            }

            let escrow_client = EscrowClient::new(&env, &escrow);
            escrow_client.release(&tree_id);

            env.events().publish(
                (Symbol::new(&env, "TreeVerified"), tree_id),
                (verifier, notes_hash),
            );
        } else {
            tree_record.status = TreeStatus::Rejected;

            env.events().publish(
                (Symbol::new(&env, "TreeRejected"), tree_id),
                (verifier, notes_hash),
            );
        }

        env.storage().persistent().set(&tree_key, &tree_record);
        Self::extend_ttl(env, &tree_key);
        Self::record_status(&env, tree_id, tree_record.status.clone());
    }

    // ── Batch Survival Update ────────────────────────────────────────────────

    /// Batch update the health/survival state of up to 100 trees in a single
    /// transaction.  Only callable by whitelisted verifiers.
    ///
    /// # Arguments
    /// * `verifier`  – The verifier performing the update.  Must authorize the
    ///   call and be present in the verifier whitelist.
    /// * `tree_ids`  – Vector of tree IDs to update.  Must not be empty and
    ///   contain at most 100 entries.
    /// * `health_states` – Vector of [`TreeHealth`] values, one per tree ID.
    ///   Length must equal `tree_ids`.
    ///
    /// # Panics
    /// * [`HarvestaError::ContractPaused`] – contract is paused.
    /// * [`TreeRegistryError::NotAuthorized`] – verifier is not whitelisted or
    ///   auth fails.
    /// * [`HarvestaError::BatchEmpty`] – `tree_ids` is empty.
    /// * [`TreeRegistryError::BatchTooLarge`] – `tree_ids.len()` exceeds 100.
    /// * [`TreeRegistryError::BatchSizeMismatch`] – lengths of `tree_ids` and
    ///   `health_states` differ.
    /// * [`TreeRegistryError::NotFound`] – a tree ID in the batch does not
    ///   exist.
    fn is_valid_health_transition(current: &Option<TreeHealth>, next: &TreeHealth) -> bool {
        match (current, next) {
            (None, TreeHealth::Healthy) => true,
            (None, TreeHealth::Struggling) => true,
            (None, TreeHealth::Dead) => true,
            (Some(TreeHealth::Healthy), TreeHealth::Struggling) => true,
            (Some(TreeHealth::Healthy), TreeHealth::Dead) => true,
            (Some(TreeHealth::Struggling), TreeHealth::Healthy) => true,
            (Some(TreeHealth::Struggling), TreeHealth::Dead) => true,
            _ => false,
        }
    }

    pub fn update_tree_health(
        env: Env,
        verifier: Address,
        tree_id: u64,
        health: TreeHealth,
    ) {
        Self::assert_not_paused(&env);
        Self::require_verifier(&env, &verifier);

        let tree_key = Self::tree_key(&env, tree_id);
        let mut tree_record: TreeRecord = env
            .storage()
            .persistent()
            .get(&tree_key)
            .unwrap_or_else(|| panic_with_error!(&env, TreeRegistryError::NotFound));

        if !Self::is_valid_health_transition(&tree_record.health, &health) {
            panic_with_error!(&env, TreeRegistryError::InvalidStatus);
        }

        tree_record.health = Some(health.clone());
        env.storage().persistent().set(&tree_key, &tree_record);
        Self::extend_ttl(&env, &tree_key);

        env.events().publish(
            (Symbol::new(&env, "TreeHealthUpdated"), tree_id),
            (verifier, health),
        );
    }

    pub fn batch_update_survival(
        env: Env,
        verifier: Address,
        tree_ids: Vec<u64>,
        health_states: Vec<TreeHealth>,
    ) {
        Self::assert_not_paused(&env);
        Self::require_verifier(&env, &verifier);

        let len = tree_ids.len();
        if len == 0 {
            panic_with_error!(&env, HarvestaError::BatchEmpty);
        }
        if len > 100 {
            panic_with_error!(&env, TreeRegistryError::BatchTooLarge);
        }
        if len != health_states.len() {
            panic_with_error!(&env, TreeRegistryError::BatchSizeMismatch);
        }

        for i in 0..len {
            let tree_id = tree_ids
                .get(i)
                .unwrap_or_else(|| panic_with_error!(&env, TreeRegistryError::NotFound));
            let health = health_states
                .get(i)
                .unwrap_or_else(|| panic_with_error!(&env, TreeRegistryError::NotFound));

            let tree_key = Self::tree_key(&env, tree_id);
            let mut tree_record: TreeRecord = env
                .storage()
                .persistent()
                .get(&tree_key)
                .unwrap_or_else(|| panic_with_error!(&env, TreeRegistryError::NotFound));

            if !Self::is_valid_health_transition(&tree_record.health, &health) {
                panic_with_error!(&env, TreeRegistryError::InvalidStatus);
            }

            tree_record.health = Some(health);
            env.storage().persistent().set(&tree_key, &tree_record);
            Self::extend_ttl(&env, &tree_key);
        }

        env.events().publish(
            (Symbol::new(&env, "BatchSurvivalUpdated"),),
            (verifier, len as u64),
        );
    }

    /// Get a tree by ID.
    pub fn get_tree(env: Env, id: u64) -> Option<TreeRecord> {
        env.storage().persistent().get(&Self::tree_key(env, id))
    }

    pub fn list_by_sponsor(env: Env, sponsor: Address) -> Vec<TreeRecord> {
        let tree_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&Self::sponsor_key(env, &sponsor))
            .unwrap_or_else(|| Vec::new(&env));
        
        let mut records = Vec::new(&env);
        for id in tree_ids.iter() {
            if let Some(record) = env.storage().persistent().get(&Self::tree_key(env, id)) {
                records.push_back(record);
            }
        }
        records
    }

    pub fn claim_milestone(
        env: Env,
        sponsor: Address,
        tree_id: u64,
        milestone_years: u64,
    ) -> i128 {
        Self::assert_not_paused(&env);
        sponsor.require_auth();

        let tree_key = Self::tree_key(env, tree_id);
        let mut tree_record: TreeRecord = env
            .storage()
            .persistent()
            .get(&tree_key)
            .unwrap_or_else(|| panic_with_error!(&env, TreeRegistryError::NotFound));

        if tree_record.sponsor != sponsor {
            panic_with_error!(&env, TreeRegistryError::NotAuthorized);
        }
        if tree_record.status == TreeStatus::Rejected {
            panic_with_error!(&env, TreeRegistryError::InvalidStatus);
        }

        let flag = Self::milestone_flag(milestone_years)
            .unwrap_or_else(|| panic_with_error!(&env, TreeRegistryError::InvalidStatus));
        if tree_record.milestone_claims & flag != 0 {
            panic_with_error!(&env, TreeRegistryError::InvalidStatus);
        }

        let required_timestamp = tree_record
            .planted_at
            .checked_add(
                milestone_years
                    .checked_mul(ONE_YEAR_SECS)
                    .expect("milestone multiplication overflow"),
            )
            .expect("timestamp overflow");

        if env.ledger().timestamp() < required_timestamp {
            panic_with_error!(&env, TreeRegistryError::InvalidStatus);
        }

        tree_record.milestone_claims |= flag;
        let became_matured = tree_record.milestone_claims == 0b111;
        if became_matured {
            tree_record.status = TreeStatus::Matured;
        }

        env.storage().persistent().set(&tree_key, &tree_record);
        if became_matured {
            Self::record_status(&env, tree_id, TreeStatus::Matured);
        }
        Self::extend_ttl(env, &tree_key);

        // ── Dynamic CO₂ rate lookup ────────────────────────────────────────────
        // Look up the species-specific CO₂ sequestration rate from the on-chain
        // SpeciesInfo table.  If the species is not registered, fall back to the
        // default hardcoded CO₂ rate for backward compatibility.
        let co2_rate = Self::get_species_co2_rate(&env, &tree_record.species);
        let amount = Self::co2_credits_for_years(co2_rate, milestone_years);

        env.events().publish(
            (Symbol::new(&env, "MilestoneClaimed"), tree_id),
            (sponsor, milestone_years, amount),
        );

        amount
    }

    /// Look up the species-specific CO₂ kg/year rate.
    ///
    /// Converts the tree's species name (stored as `soroban_sdk::String`)
    /// to a `Symbol` via `Display`/`ToString` — available in Soroban SDK
    /// v21 — then retrieves the `SpeciesInfo` record.  Returns the CO₂ rate
    /// in kg/year (by dividing the scaled `co2_scaled` value by 100).
    /// Falls back to `CO2_KG_PER_YEAR` if no species info is registered.
    fn get_species_co2_rate(env: &Env, species: &soroban_sdk::String) -> i128 {
        let slug = Symbol::new(env, &species.to_string());
        if let Some(info) = env
            .storage()
            .persistent()
            .get::<_, SpeciesInfo>(&Self::species_info_key(env, &slug))
        {
            // co2_scaled is kg/year × 100, so divide by 100 to get kg/year
            if info.co2_scaled > 0 {
                info.co2_scaled / 100
            } else {
                CO2_KG_PER_YEAR
            }
        } else {
            CO2_KG_PER_YEAR
        }
    }

    pub fn tree_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&symbol_short!("TREECOUNT"))
            .unwrap_or(0)
    }

    pub fn register_species(env: Env, slug: Symbol, co2_scaled: i128, maturity_years: u32) {
        Self::require_admin(&env);

        if co2_scaled <= 0 {
            panic_with_error!(&env, HarvestaError::Co2MustBePositive);
        }
        if maturity_years == 0 {
            panic_with_error!(&env, HarvestaError::MaturityYearsMustBePositive);
        }

        let existing: Option<SpeciesInfo> = env
            .storage()
            .persistent()
            .get(&Self::species_info_key(env, &slug));
        if existing.is_some() {
            panic_with_error!(&env, TreeRegistryError::SpeciesAlreadyExists);
        }

        let info = SpeciesInfo {
            co2_scaled,
            maturity_years,
            updated_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&Self::species_info_key(env, &slug), &info);
        Self::extend_ttl(env, &Self::species_info_key(env, &slug));

        env.events().publish(
            (symbol_short!("species"), symbol_short!("register")),
            (slug, co2_scaled, maturity_years),
        );
    }

    pub fn update_species(env: Env, slug: Symbol, co2_scaled: i128, maturity_years: u32) {
        Self::require_admin(&env);

        if co2_scaled <= 0 {
            panic_with_error!(&env, HarvestaError::Co2MustBePositive);
        }
        if maturity_years == 0 {
            panic_with_error!(&env, HarvestaError::MaturityYearsMustBePositive);
        }

        let _existing: SpeciesInfo = env
            .storage()
            .persistent()
            .get(&Self::species_info_key(env, &slug))
            .unwrap_or_else(|| panic_with_error!(&env, TreeRegistryError::SpeciesNotFound));

        let updated = SpeciesInfo {
            co2_scaled,
            maturity_years,
            updated_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&Self::species_info_key(env, &slug), &updated);
        Self::extend_ttl(env, &Self::species_info_key(env, &slug));

        env.events().publish(
            (symbol_short!("species"), symbol_short!("update")),
            (slug, co2_scaled, maturity_years),
        );
    }

    pub fn get_species_info(env: Env, slug: Symbol) -> Option<SpeciesInfo> {
        env.storage()
            .persistent()
            .get(&Self::species_info_key(env, &slug))
    }

    pub fn unregister_species(env: Env, slug: Symbol) {
        Self::require_admin(&env);

        let slug_str = Self::symbol_to_string(env, &slug);
        let has_trees: bool = env
            .storage()
            .persistent()
            .get(&Self::species_trees_key(env, &slug_str))
            .map(|v: Vec<u64>| !v.is_empty())
            .unwrap_or(false);
        if has_trees {
            panic_with_error!(&env, TreeRegistryError::InvalidStatus);
        }

        env.storage()
            .persistent()
            .remove(&Self::species_info_key(env, &slug));

        env.events().publish(
            (symbol_short!("species"), symbol_short!("unregister")),
            slug,
        );
    }

    pub fn get_distinct_species(env: Env) -> Vec<soroban_sdk::String> {
        env.storage()
            .instance()
            .get(&Self::species_list_key(env))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_tree_ids_by_species(env: Env, species: soroban_sdk::String) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&Self::species_trees_key(env, &species))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_species_count(env: Env, species: soroban_sdk::String) -> u64 {
        env.storage()
            .persistent()
            .get(&Self::species_trees_key(env, &species))
            .map(|v: Vec<u64>| v.len() as u64)
            .unwrap_or(0u64)
    }

    pub fn get_tree_ids_by_species_and_region(
        env: Env,
        species: soroban_sdk::String,
        region: soroban_sdk::String,
    ) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&Self::species_region_key(env, &species, &region))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_tree_ids_by_species_and_status(
        env: Env,
        species: soroban_sdk::String,
        status: TreeStatus,
    ) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&Self::species_status_key(env, &species, &status))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_species_in_region(env: Env, region: soroban_sdk::String) -> Vec<soroban_sdk::String> {
        env.storage()
            .persistent()
            .get(&Self::region_species_key(env, &region))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn pause(env: Env) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &true);
        env.events()
            .publish((symbol_short!("paused"),), env.ledger().timestamp());
    }

    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &false);
        env.events()
            .publish((symbol_short!("unpaused"),), env.ledger().timestamp());
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false)
    }

    pub fn get_status_history(env: Env, tree_id: u64) -> Vec<(TreeStatus, u64)> {
        if !env.storage().persistent().has(&Self::tree_key(&env, tree_id)) {
            panic_with_error!(&env, TreeRegistryError::NotFound);
        }
        env.storage().persistent().get(&Self::status_history_key(&env, tree_id)).unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_planter_metrics(env: Env, wallet: Address) -> PlanterMetrics {
        let tree_ids: Vec<u64> = env.storage().persistent().get(&Self::planter_key(&env, &wallet)).unwrap_or_else(|| Vec::new(&env));
        let mut completed = 0u64;
        let mut completion_total = 0u64;
        let mut terminal = 0u64;
        for id in tree_ids.iter() {
            if let Some(tree) = env.storage().persistent().get::<_, TreeRecord>(&Self::tree_key(&env, id)) {
                if tree.status == TreeStatus::Matured {
                    completed += 1;
                    if let Some(history) = env.storage().persistent().get::<_, Vec<(TreeStatus, u64)>>(&Self::status_history_key(&env, id)) {
                        for index in 0..history.len() {
                            if let Some((status, timestamp)) = history.get(index) {
                                if status == TreeStatus::Matured {
                                    completion_total += timestamp.saturating_sub(tree.planted_at);
                                    break;
                                }
                            }
                        }
                    }
                }
                if tree.status == TreeStatus::Matured || tree.status == TreeStatus::Rejected { terminal += 1; }
            }
        }
        let current_bond_locked = env.storage().persistent().get(&Self::bond_key(&env, &wallet)).unwrap_or(0i128);
        PlanterMetrics {
            trees_completed: completed,
            avg_completion_time: if completed == 0 { 0 } else { completion_total / completed },
            success_rate: if terminal == 0 { 0 } else { completed * 100 / terminal },
            current_bond_locked,
        }
    }

    /// Set the planter's currently locked bond amount for escrow integrations.
    pub fn set_planter_bond(env: Env, wallet: Address, amount: i128) {
        Self::require_admin(&env);
        if amount < 0 {
            panic_with_error!(&env, TreeRegistryError::InvalidStatus);
        }
        env.storage().persistent().set(&Self::bond_key(&env, &wallet), &amount);
        Self::extend_ttl(&env, &Self::bond_key(&env, &wallet));
    }

    fn tree_key(env: &Env, id: u64) -> (Symbol, u64) {
        (symbol_short!("TREE"), id)
    }

    fn planter_key(env: &Env, planter: &Address) -> (Symbol, Address) {
        (symbol_short!("PLANTER"), planter.clone())
    }

    fn status_history_key(env: &Env, id: u64) -> (Symbol, u64) {
        (symbol_short!("HISTORY"), id)
    }

    fn bond_key(env: &Env, wallet: &Address) -> (Symbol, Address) {
        (symbol_short!("BOND"), wallet.clone())
    }

    fn record_status(env: &Env, tree_id: u64, status: TreeStatus) {
        let key = Self::status_history_key(env, tree_id);
        let mut history: Vec<(TreeStatus, u64)> = env.storage().persistent().get(&key).unwrap_or_else(|| Vec::new(env));
        history.push_back((status, env.ledger().timestamp()));
        env.storage().persistent().set(&key, &history);
        Self::extend_ttl(env, &key);
    }

    fn sponsor_key(env: &Env, sponsor: &Address) -> (Symbol, Address) {
        (symbol_short!("SPONSOR"), sponsor.clone())
    }

    fn planter_score_key(env: &Env, planter: &Address) -> (Symbol, Address) {
        (symbol_short!("SCORE"), planter.clone())
    }

    fn species_list_key(env: &Env) -> Symbol {
        Symbol::new(env, "SPLIST")
    }

    fn species_trees_key(env: &Env, species: &soroban_sdk::String) -> (Symbol, soroban_sdk::String) {
        (symbol_short!("SPTREES"), species.clone())
    }

    fn species_info_key(env: &Env, slug: &Symbol) -> (Symbol, Symbol) {
        (symbol_short!("SPINFO"), slug.clone())
    }

    fn species_region_key(env: &Env, species: &soroban_sdk::String, region: &soroban_sdk::String) -> (Symbol, soroban_sdk::String, soroban_sdk::String) {
        (symbol_short!("SPRGN"), species.clone(), region.clone())
    }

    fn species_status_key(env: &Env, species: &soroban_sdk::String, status: &TreeStatus) -> (Symbol, soroban_sdk::String, TreeStatus) {
        (symbol_short!("SPSTAT"), species.clone(), status.clone())
    }

    fn region_species_key(env: &Env, region: &soroban_sdk::String) -> (Symbol, soroban_sdk::String) {
        (symbol_short!("RGLST"), region.clone())
    }

    fn weather_key(env: &Env, region: &soroban_sdk::String) -> soroban_sdk::Val {
        (symbol_short!("WTHR"), region.clone()).into_val(env)
    }

    fn milestone_flag(milestone_years: u64) -> Option<u32> {
        match milestone_years {
            1 => Some(1),
            5 => Some(2),
            10 => Some(4),
            _ => None,
        }
    }

    fn co2_credits_for_years(rate: i128, years: u64) -> i128 {
        rate.checked_mul(i128::from(years))
            .expect("CO2 credit overflow")
    }

    fn extend_ttl(env: &Env, key: &(impl IntoVal<Env, Val> + ?Sized)) {
        env.storage()
            .persistent()
            .extend_ttl(key, DEFAULT_PERSISTENT_TTL, DEFAULT_PERSISTENT_TTL);
    }

    fn symbol_to_string(env: &Env, symbol: &Symbol) -> soroban_sdk::String {
        let s: &str = &symbol.clone().into_string();
        soroban_sdk::String::from_str(env, s)
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        admin.require_auth();
    }

    fn require_escrow(env: &Env) {
        let escrow: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ESCROW"))
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        escrow.require_auth();
    }

    fn require_verifier(env: &Env, verifier: &Address) {
        verifier.require_auth();
        let verifiers: Vec<Address> = env
            .storage()
            .instance()
            .get(&symbol_short!("VERIFIERS"))
            .unwrap_or_else(|| Vec::new(env));
        if !verifiers.contains(verifier) {
            panic_with_error!(env, TreeRegistryError::NotAuthorized);
        }
    }

    fn assert_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false);
        if paused {
            panic_with_error!(env, HarvestaError::ContractPaused);
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger as _, Events}, Address, Env, String};

    fn setup() -> (Env, Address, Address, Address, Address, TreeRegistryClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);

        client.initialize(&admin, &escrow);

        (env, admin, escrow, sponsor, planter, client)
    }

    #[test]
    fn test_mint_tree() {
        let (env, _, _escrow, sponsor, planter, client) = setup();

        let species = String::from_str(&env, "Acacia");
        let region = String::from_str(&env, "Kaduna");

        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);

        assert_eq!(tree_id, 0);
        assert_eq!(client.tree_count(), 1);

        let tree = client.get_tree(&0).unwrap();
        assert_eq!(tree.id, 0);
        assert_eq!(tree.species, species);
        assert_eq!(tree.sponsor, sponsor);
        assert_eq!(tree.planter, planter);
        assert_eq!(tree.region, region);
        assert_eq!(tree.status, TreeStatus::Planted);
        assert_eq!(tree.notes_hash, None);
    }

    #[test]
    fn test_list_by_sponsor() {
        let (env, _, _escrow, sponsor, planter, client) = setup();

        let species1 = String::from_str(&env, "Acacia");
        let species2 = String::from_str(&env, "Mango");
        let region = String::from_str(&env, "Kaduna");

        client.mint_tree(&sponsor, &species1, &region, &planter);
        client.mint_tree(&sponsor, &species2, &region, &planter);

        let trees = client.list_by_sponsor(&sponsor);
        assert_eq!(trees.len(), 2);
    }

    #[test]
    fn test_add_and_remove_verifier() {
        let (env, _admin, _, _, _, client) = setup();
        let verifier = Address::generate(&env);

        // Test add verifier
        client.add_verifier(&verifier);
        let verifiers = client.get_verifiers();
        assert_eq!(verifiers.len(), 1);
        assert_eq!(verifiers.get(0).unwrap(), verifier);

        // Test remove verifier
        client.remove_verifier(&verifier);
        let verifiers_after = client.get_verifiers();
        assert_eq!(verifiers_after.len(), 0);
    }

    #[test]
    fn test_sequential_id_generation_and_get_tree() {
        let env = Env::default();
        // Authorise only the escrow for mint operations
        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);

        client.initialize(&admin, &escrow);

        env.mock_all_auths();

        let species = String::from_str(&env, "Oak");
        let region = String::from_str(&env, "Nairobi");

        let id0 = client.mint_tree(&sponsor, &species, &region, &planter);
        let id1 = client.mint_tree(&sponsor, &species, &region, &planter);
        let id2 = client.mint_tree(&sponsor, &species, &region, &planter);

        assert_eq!(id0, 0);
        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
        assert_eq!(client.tree_count(), 3);

        // get_tree returns correct record for id1
        let tree = client.get_tree(&1).unwrap();
        assert_eq!(tree.id, 1);
        assert_eq!(tree.species, species);
        assert_eq!(tree.sponsor, sponsor);
        assert_eq!(tree.planter, planter);
        assert_eq!(tree.region, region);
    }

    #[test]
    #[should_panic]
    fn test_only_escrow_can_call_mint_tree() {
        // No auths are mocked — mint_tree must panic because escrow.require_auth fails
        let env = Env::default();
        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);

        client.initialize(&admin, &escrow);

        let species = String::from_str(&env, "Pine");
        let region = String::from_str(&env, "Lagos");

        // No env.mock_auths set — require_escrow should panic on unauthorised call
        client.mint_tree(&sponsor, &species, &region, &planter);
    }

    #[test]
    fn test_event_emission_on_mint() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);

        client.initialize(&admin, &escrow);

        env.mock_all_auths();

        let species = String::from_str(&env, "Baobab");
        let region = String::from_str(&env, "Kaduna");

        let pre_events = env.events().all().len();
        let _id = client.mint_tree(&sponsor, &species, &region, &planter);

        assert!(env.events().all().len() > pre_events, "TreeMinted event should be published");
    }

    #[test]
    fn test_mint_tree_rejects_at_u64_max() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);

        client.initialize(&admin, &escrow);

        // Force the tree-id counter to its maximum value to exercise the edge case.
        env.as_contract(&contract_id, || {
            env.storage()
                .instance()
                .set(&symbol_short!("TREECOUNT"), &u64::MAX);
        });

        let species = String::from_str(&env, "Acacia");
        let region = String::from_str(&env, "Kaduna");

        // The mint must be rejected with the descriptive `ContractFull` error
        // instead of panicking on a `u64` overflow.
        let result = client.try_mint_tree(&sponsor, &species, &region, &planter);
        assert_eq!(result, Err(Ok(TreeRegistryError::ContractFull)));

        // The counter must remain untouched — no wrap / overflow occurred.
        assert_eq!(client.tree_count(), u64::MAX);
    }

    #[test]
    fn test_claim_milestone_after_one_year() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);

        client.initialize(&admin, &escrow);
        env.mock_all_auths();

        let species = String::from_str(&env, "Oak");
        let region = String::from_str(&env, "Nairobi");
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);

        let planted_at = env.ledger().timestamp();
        env.ledger().set_timestamp(planted_at + ONE_YEAR_SECS + 1);

        let amount = client.claim_milestone(&sponsor, &tree_id, &1);
        assert_eq!(amount, CO2_KG_PER_YEAR);

        let tree = client.get_tree(&tree_id).unwrap();
        assert_eq!(tree.milestone_claims, 1);
        assert_eq!(tree.status, TreeStatus::Planted);
    }

    #[test]
    fn test_claim_milestone_after_five_years_and_event() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);

        client.initialize(&admin, &escrow);
        env.mock_all_auths();

        let species = String::from_str(&env, "Teak");
        let region = String::from_str(&env, "Lagos");
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);

        let planted_at = env.ledger().timestamp();
        env.ledger().set_timestamp(planted_at + ONE_YEAR_SECS * 5 + 1);

        let pre_events = env.events().all().len();
        let amount = client.claim_milestone(&sponsor, &tree_id, &5);
        assert_eq!(amount, CO2_KG_PER_YEAR * 5);
        assert!(env.events().all().len() > pre_events, "MilestoneClaimed event should be published");

        let tree = client.get_tree(&tree_id).unwrap();
        assert_eq!(tree.milestone_claims, 2);
    }

    #[test]
    fn test_claim_milestone_after_ten_years() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);

        client.initialize(&admin, &escrow);
        env.mock_all_auths();

        let species = String::from_str(&env, "Mahogany");
        let region = String::from_str(&env, "Dar es Salaam");
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);

        let planted_at = env.ledger().timestamp();
        env.ledger().set_timestamp(planted_at + ONE_YEAR_SECS * 10 + 1);

        let amount = client.claim_milestone(&sponsor, &tree_id, &10);
        assert_eq!(amount, CO2_KG_PER_YEAR * 10);

        let tree = client.get_tree(&tree_id).unwrap();
        assert_eq!(tree.milestone_claims, 4);
        assert_eq!(tree.status, TreeStatus::Planted);
    }

    #[test]
    #[should_panic]
    fn test_claim_milestone_before_maturity_rejected() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);

        client.initialize(&admin, &escrow);
        env.mock_all_auths();

        let species = String::from_str(&env, "Pine");
        let region = String::from_str(&env, "Kigali");
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);

        client.claim_milestone(&sponsor, &tree_id, &5);
    }

    #[test]
    #[should_panic]
    fn test_claim_milestone_unauthorized_rejected() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let other = Address::generate(&env);
        let planter = Address::generate(&env);

        client.initialize(&admin, &escrow);
        env.mock_all_auths();

        let species = String::from_str(&env, "Maple");
        let region = String::from_str(&env, "Kampala");
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);

        let planted_at = env.ledger().timestamp();
        env.ledger().set_timestamp(planted_at + ONE_YEAR_SECS + 1);

        client.claim_milestone(&other, &tree_id, &1);
    }

    #[test]
    #[should_panic]
    fn test_claim_milestone_twice_for_same_milestone() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);

        client.initialize(&admin, &escrow);
        env.mock_all_auths();

        let species = String::from_str(&env, "Mahogany");
        let region = String::from_str(&env, "Dar es Salaam");
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);

        let planted_at = env.ledger().timestamp();
        env.ledger().set_timestamp(planted_at + ONE_YEAR_SECS + 1);

        client.claim_milestone(&sponsor, &tree_id, &1);
        client.claim_milestone(&sponsor, &tree_id, &1);
    }

    // ── Batch Survival Update Tests ───────────────────────────────────────────

    #[test]
    fn test_batch_update_survival_success() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);
        let verifier = Address::generate(&env);

        client.initialize(&admin, &escrow);
        client.add_verifier(&verifier);

        // Mint 5 trees
        let species = String::from_str(&env, "Oak");
        let region = String::from_str(&env, "Nairobi");
        let mut tree_ids = Vec::new(&env);
        for _ in 0..5 {
            let id = client.mint_tree(&sponsor, &species, &region, &planter);
            tree_ids.push_back(id);
        }

        // Build health states: alternating Healthy / Struggling / Dead
        let mut health_states = Vec::new(&env);
        health_states.push_back(TreeHealth::Healthy);
        health_states.push_back(TreeHealth::Struggling);
        health_states.push_back(TreeHealth::Dead);
        health_states.push_back(TreeHealth::Healthy);
        health_states.push_back(TreeHealth::Struggling);

        client.batch_update_survival(&verifier, &tree_ids, &health_states);

        // Verify each tree was updated correctly
        let tree0 = client.get_tree(&0).unwrap();
        assert_eq!(tree0.health, Some(TreeHealth::Healthy));

        let tree1 = client.get_tree(&1).unwrap();
        assert_eq!(tree1.health, Some(TreeHealth::Struggling));

        let tree2 = client.get_tree(&2).unwrap();
        assert_eq!(tree2.health, Some(TreeHealth::Dead));

        let tree3 = client.get_tree(&3).unwrap();
        assert_eq!(tree3.health, Some(TreeHealth::Healthy));

        let tree4 = client.get_tree(&4).unwrap();
        assert_eq!(tree4.health, Some(TreeHealth::Struggling));
    }

    #[test]
    fn test_batch_update_survival_emits_event() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);
        let verifier = Address::generate(&env);

        client.initialize(&admin, &escrow);
        client.add_verifier(&verifier);

        let species = String::from_str(&env, "Oak");
        let region = String::from_str(&env, "Nairobi");
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);

        let mut tree_ids = Vec::new(&env);
        tree_ids.push_back(tree_id);
        let mut health_states = Vec::new(&env);
        health_states.push_back(TreeHealth::Healthy);

        client.batch_update_survival(&verifier, &tree_ids, &health_states);

        // Assert the batch event was published
        env.events().assert_published(
            (Symbol::new(&env, "BatchSurvivalUpdated"),),
            (verifier, 1u64),
        );
    }

    #[test]
    fn test_batch_update_survival_with_100_trees() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);
        let verifier = Address::generate(&env);

        client.initialize(&admin, &escrow);
        client.add_verifier(&verifier);

        let species = String::from_str(&env, "Pine");
        let region = String::from_str(&env, "Lagos");

        // Mint exactly 100 trees
        let mut tree_ids = Vec::new(&env);
        let mut health_states = Vec::new(&env);
        for i in 0..100 {
            let id = client.mint_tree(&sponsor, &species, &region, &planter);
            tree_ids.push_back(id);
            health_states.push_back(if i % 3 == 0 {
                TreeHealth::Healthy
            } else if i % 3 == 1 {
                TreeHealth::Struggling
            } else {
                TreeHealth::Dead
            });
        }

        // Batch update all 100 trees (boundary case)
        client.batch_update_survival(&verifier, &tree_ids, &health_states);

        // Spot-check a few trees
        assert_eq!(client.get_tree(&0).unwrap().health, Some(TreeHealth::Healthy));
        assert_eq!(client.get_tree(&50).unwrap().health, Some(TreeHealth::Struggling));
        assert_eq!(client.get_tree(&99).unwrap().health, Some(TreeHealth::Dead));
    }

    #[test]
    #[should_panic]
    fn test_batch_update_survival_empty_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let verifier = Address::generate(&env);

        client.initialize(&admin, &escrow);
        client.add_verifier(&verifier);

        let tree_ids = Vec::new(&env);
        let health_states = Vec::new(&env);

        // Should panic with BatchEmpty
        client.batch_update_survival(&verifier, &tree_ids, &health_states);
    }

    #[test]
    #[should_panic]
    fn test_batch_update_survival_too_large_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let verifier = Address::generate(&env);

        client.initialize(&admin, &escrow);
        client.add_verifier(&verifier);

        let mut tree_ids = Vec::new(&env);
        let mut health_states = Vec::new(&env);
        for _ in 0..101 {
            tree_ids.push_back(0);
            health_states.push_back(TreeHealth::Healthy);
        }

        // Should panic with BatchTooLarge
        client.batch_update_survival(&verifier, &tree_ids, &health_states);
    }

    #[test]
    #[should_panic]
    fn test_batch_update_survival_size_mismatch_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);
        let verifier = Address::generate(&env);

        client.initialize(&admin, &escrow);
        client.add_verifier(&verifier);

        let species = String::from_str(&env, "Oak");
        let region = String::from_str(&env, "Nairobi");
        client.mint_tree(&sponsor, &species, &region, &planter);

        let mut tree_ids = Vec::new(&env);
        tree_ids.push_back(0);
        tree_ids.push_back(0);

        let mut health_states = Vec::new(&env);
        health_states.push_back(TreeHealth::Healthy);
        // Only 1 health state for 2 tree IDs → mismatch

        // Should panic with BatchSizeMismatch
        client.batch_update_survival(&verifier, &tree_ids, &health_states);
    }

    #[test]
    #[should_panic]
    fn test_batch_update_survival_tree_not_found() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let verifier = Address::generate(&env);

        client.initialize(&admin, &escrow);
        client.add_verifier(&verifier);

        // Tree 999 doesn't exist
        let mut tree_ids = Vec::new(&env);
        tree_ids.push_back(999);
        let mut health_states = Vec::new(&env);
        health_states.push_back(TreeHealth::Healthy);

        // Should panic with NotFound
        client.batch_update_survival(&verifier, &tree_ids, &health_states);
    }

    #[test]
    #[should_panic]
    fn test_batch_update_survival_unauthorized_verifier() {
        let env = Env::default();

        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);
        let verifier = Address::generate(&env);

        client.initialize(&admin, &escrow);
        // NOT adding verifier to whitelist

        // Mock escrow auth so minting succeeds
        env.mock_auths(&[&escrow]);

        let species = String::from_str(&env, "Oak");
        let region = String::from_str(&env, "Nairobi");
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);

        let mut tree_ids = Vec::new(&env);
        tree_ids.push_back(tree_id);
        let mut health_states = Vec::new(&env);
        health_states.push_back(TreeHealth::Healthy);

        // verifier auth is not mocked, and verifier is not whitelisted
        client.batch_update_survival(&verifier, &tree_ids, &health_states);
    }

    #[test]
    #[should_panic]
    fn test_batch_update_survival_when_paused() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);
        let verifier = Address::generate(&env);

        client.initialize(&admin, &escrow);
        client.add_verifier(&verifier);

        let species = String::from_str(&env, "Oak");
        let region = String::from_str(&env, "Nairobi");
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);

        client.pause();

        let mut tree_ids = Vec::new(&env);
        tree_ids.push_back(tree_id);
        let mut health_states = Vec::new(&env);
        health_states.push_back(TreeHealth::Healthy);

        // Should panic with ContractPaused
        client.batch_update_survival(&verifier, &tree_ids, &health_states);
    }

    #[test]
    fn test_batch_update_survival_overwrite_previous_health() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);
        let verifier = Address::generate(&env);

        client.initialize(&admin, &escrow);
        client.add_verifier(&verifier);

        let species = String::from_str(&env, "Oak");
        let region = String::from_str(&env, "Nairobi");
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);

        // First update: Healthy
        let mut tree_ids = Vec::new(&env);
        tree_ids.push_back(tree_id);
        let mut health_states = Vec::new(&env);
        health_states.push_back(TreeHealth::Healthy);
        client.batch_update_survival(&verifier, &tree_ids, &health_states);

        assert_eq!(client.get_tree(&tree_id).unwrap().health, Some(TreeHealth::Healthy));

        // Second update: overwrite to Dead
        let mut health_states2 = Vec::new(&env);
        health_states2.push_back(TreeHealth::Dead);
        client.batch_update_survival(&verifier, &tree_ids, &health_states2);

        assert_eq!(client.get_tree(&tree_id).unwrap().health, Some(TreeHealth::Dead));
    }

    #[test]
    fn test_newly_minted_tree_has_no_health() {
        let (env, _, _, sponsor, planter, client) = setup();

        let species = String::from_str(&env, "Acacia");
        let region = String::from_str(&env, "Kaduna");

        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);
        let tree = client.get_tree(&tree_id).unwrap();

        assert_eq!(tree.health, None);
    }

    #[test]
    fn test_single_tree_health_update() {
        let (env, _, _, sponsor, planter, client) = setup();
        let species = String::from_str(&env, "Acacia");
        let region = String::from_str(&env, "Kaduna");
        let verifier = Address::generate(&env);
        client.add_verifier(&verifier);
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);
        client.update_tree_health(&verifier, &tree_id, &TreeHealth::Healthy);
        assert_eq!(client.get_tree(&tree_id).unwrap().health, Some(TreeHealth::Healthy));
        client.update_tree_health(&verifier, &tree_id, &TreeHealth::Struggling);
        assert_eq!(client.get_tree(&tree_id).unwrap().health, Some(TreeHealth::Struggling));
        client.update_tree_health(&verifier, &tree_id, &TreeHealth::Healthy);
        assert_eq!(client.get_tree(&tree_id).unwrap().health, Some(TreeHealth::Healthy));
    }

    #[test]
    fn test_single_tree_health_update_to_dead() {
        let (env, _, _, sponsor, planter, client) = setup();
        let species = String::from_str(&env, "Acacia");
        let region = String::from_str(&env, "Kaduna");
        let verifier = Address::generate(&env);
        client.add_verifier(&verifier);
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);
        client.update_tree_health(&verifier, &tree_id, &TreeHealth::Struggling);
        client.update_tree_health(&verifier, &tree_id, &TreeHealth::Dead);
        assert_eq!(client.get_tree(&tree_id).unwrap().health, Some(TreeHealth::Dead));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #86)")]
    fn test_dead_to_healthy_transition_rejected() {
        let (env, _, _, sponsor, planter, client) = setup();
        let species = String::from_str(&env, "Acacia");
        let region = String::from_str(&env, "Kaduna");
        let verifier = Address::generate(&env);
        client.add_verifier(&verifier);
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);
        client.update_tree_health(&verifier, &tree_id, &TreeHealth::Dead);
        client.update_tree_health(&verifier, &tree_id, &TreeHealth::Healthy);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #86)")]
    fn test_dead_to_struggling_transition_rejected() {
        let (env, _, _, sponsor, planter, client) = setup();
        let species = String::from_str(&env, "Acacia");
        let region = String::from_str(&env, "Kaduna");
        let verifier = Address::generate(&env);
        client.add_verifier(&verifier);
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);
        client.update_tree_health(&verifier, &tree_id, &TreeHealth::Dead);
        client.update_tree_health(&verifier, &tree_id, &TreeHealth::Struggling);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #86)")]
    fn test_batch_update_rejects_invalid_dead_transition() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TreeRegistry);
        let client = TreeRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let escrow = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);
        let verifier = Address::generate(&env);
        client.initialize(&admin, &escrow);
        client.add_verifier(&verifier);
        let species = String::from_str(&env, "Oak");
        let region = String::from_str(&env, "Nairobi");
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);
        let mut ids = Vec::new(&env);
        ids.push_back(tree_id);
        let mut healths = Vec::new(&env);
        healths.push_back(TreeHealth::Struggling);
        client.batch_update_survival(&verifier, &ids, &healths);
        let mut dead = Vec::new(&env);
        dead.push_back(TreeHealth::Dead);
        client.batch_update_survival(&verifier, &ids, &dead);
        let mut recover = Vec::new(&env);
        recover.push_back(TreeHealth::Healthy);
        client.batch_update_survival(&verifier, &ids, &recover);
    }
}
