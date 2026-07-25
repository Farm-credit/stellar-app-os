#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, panic_with_error,
    symbol_short, Address, Env, IntoVal, Symbol, Vec,
};
use harvesta_errors::HarvestaError;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum TreeRegistryError {
    NotFound = 85,
    InvalidStatus = 86,
    NotAuthorized = 87,
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum TreeStatus {
    Planted,
    Verified,
    Matured,
    Rejected,
}

const ONE_YEAR_SECS: u64 = 31_536_000;
const CO2_KG_PER_YEAR: i128 = 48;

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
    pub notes_hash: Option<soroban_sdk::String>,
    pub milestone_claims: u32,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct TreeRegistry;

#[contractimpl]
impl TreeRegistry {
    /// Initialize the tree registry with an admin and escrow contract address.
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

    /// Mint a new tree (only callable by escrow contract).
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
        let tree_id = count;

        let record = TreeRecord {
            id: tree_id,
            species: species.clone(),
            sponsor: sponsor.clone(),
            planter: planter.clone(),
            region: region.clone(),
            planted_at: env.ledger().timestamp(),
            status: TreeStatus::Planted,
            notes_hash: None,
            milestone_claims: 0,
        };

        env.storage().persistent().set(&Self::tree_key(&env, tree_id), &record);

        // Update tree count
        env.storage()
            .instance()
            .set(&symbol_short!("TREECOUNT"), &count.checked_add(1).expect("tree count overflow"));

        // Add to sponsor's tree list
        let mut sponsor_trees: Vec<u64> = env
            .storage()
            .persistent()
            .get(&Self::sponsor_key(&env, &sponsor))
            .unwrap_or_else(|| Vec::new(&env));
        sponsor_trees.push_back(tree_id);
        env.storage().persistent().set(&Self::sponsor_key(&env, &sponsor), &sponsor_trees);

        // Emit TreeMinted event
        env.events().publish(
            (Symbol::new(&env, "TreeMinted"), tree_id),
            (sponsor, species, region, planter),
        );

        tree_id
    }

    // ── Verifier Management ─────────────────────────────────────────────────────

    /// Add a verifier (admin only)
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

    /// Remove a verifier (admin only)
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

    /// Get all verifiers
    pub fn get_verifiers(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&symbol_short!("VERIFIERS"))
            .unwrap_or_else(|| Vec::new(&env))
    }

    // ── Planter Score ──────────────────────────────────────────────────────────

    /// Get a planter's score
    pub fn get_planter_score(env: Env, planter: Address) -> u64 {
        env.storage()
            .persistent()
            .get(&Self::planter_score_key(&env, &planter))
            .unwrap_or(0)
    }

    // ── Verify Tree ───────────────────────────────────────────────────────────

    /// Verify a tree (only callable by whitelisted verifiers)
    pub fn verify_tree(
        env: Env,
        verifier: Address,
        tree_id: u64,
        approved: bool,
        notes_hash: Option<soroban_sdk::String>,
    ) {
        Self::assert_not_paused(&env);
        Self::require_verifier(&env, &verifier);

        let tree_key = Self::tree_key(&env, tree_id);
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

            // Increment planter's score
            let score_key = Self::planter_score_key(&env, &tree_record.planter);
            let current_score: u64 = env.storage().persistent().get(&score_key).unwrap_or(0);
            env.storage().persistent().set(&score_key, &(current_score + 1));

            // Call escrow to release funds
            let escrow: Address = env
                .storage()
                .instance()
                .get(&symbol_short!("ESCROW"))
                .unwrap();

            // Define a client for the escrow contract
            #[contractclient(name = "EscrowClient")]
            trait EscrowTrait {
                fn release(env: Env, tree_id: u64);
            }

            let escrow_client = EscrowClient::new(&env, &escrow);
            escrow_client.release(&tree_id);

            // Emit TreeVerified event
            env.events().publish(
                (Symbol::new(&env, "TreeVerified"), tree_id),
                (verifier, notes_hash),
            );
        } else {
            tree_record.status = TreeStatus::Rejected;

            // Emit TreeRejected event
            env.events().publish(
                (Symbol::new(&env, "TreeRejected"), tree_id),
                (verifier, notes_hash),
            );
        }

        env.storage().persistent().set(&tree_key, &tree_record);
    }

    /// Get a tree by ID.
    pub fn get_tree(env: Env, id: u64) -> Option<TreeRecord> {
        env.storage().persistent().get(&Self::tree_key(&env, id))
    }

    /// List all trees for a sponsor.
    pub fn list_by_sponsor(env: Env, sponsor: Address) -> Vec<TreeRecord> {
        let tree_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&Self::sponsor_key(&env, &sponsor))
            .unwrap_or_else(|| Vec::new(&env));
        
        let mut records = Vec::new(&env);
        for id in tree_ids.iter() {
            if let Some(record) = env.storage().persistent().get(&Self::tree_key(&env, id)) {
                records.push_back(record);
            }
        }
        records
    }

    /// Claim a tree maturity milestone and unlock CO2 credits.
    pub fn claim_milestone(
        env: Env,
        sponsor: Address,
        tree_id: u64,
        milestone_years: u64,
    ) -> i128 {
        Self::assert_not_paused(&env);
        sponsor.require_auth();

        let tree_key = Self::tree_key(&env, tree_id);
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
            panic_with_error!(&env, HarvestaError::InvalidStatus);
        }

        tree_record.milestone_claims |= flag;
        if tree_record.milestone_claims == 0b111 {
            tree_record.status = TreeStatus::Matured;
        }

        env.storage().persistent().set(&tree_key, &tree_record);

        let amount = Self::co2_credits_for_years(milestone_years);
        env.events().publish(
            (Symbol::new(&env, "MilestoneClaimed"), tree_id),
            (sponsor, milestone_years, amount),
        );

        amount
    }

    /// Get the total number of trees.
    pub fn tree_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&symbol_short!("TREECOUNT"))
            .unwrap_or(0)
    }

    // ── Admin functions ───────────────────────────────────────────────────────

    /// Pause the contract (admin only).
    pub fn pause(env: Env) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &true);
        env.events()
            .publish((symbol_short!("paused"),), env.ledger().timestamp());
    }

    /// Unpause the contract (admin only).
    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("PAUSED"), &false);
        env.events()
            .publish((symbol_short!("unpaused"),), env.ledger().timestamp());
    }

    /// Check if contract is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&symbol_short!("PAUSED"))
            .unwrap_or(false)
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn tree_key(env: &Env, id: u64) -> soroban_sdk::Val {
        (symbol_short!("TREE"), id).into_val(env)
    }

    fn sponsor_key(env: &Env, sponsor: &Address) -> soroban_sdk::Val {
        (symbol_short!("SPONSOR"), sponsor.clone()).into_val(env)
    }

    fn planter_score_key(env: &Env, planter: &Address) -> soroban_sdk::Val {
        (symbol_short!("SCORE"), planter.clone()).into_val(env)
    }

    fn milestone_flag(milestone_years: u64) -> Option<u32> {
        match milestone_years {
            1 => Some(1),
            5 => Some(2),
            10 => Some(4),
            _ => None,
        }
    }

    fn co2_credits_for_years(years: u64) -> i128 {
        CO2_KG_PER_YEAR
            .checked_mul(i128::from(years))
            .expect("CO2 credit overflow")
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
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

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
        let (env, admin, _, _, _, client) = setup();
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

        // Only escrow is authorised to call mint_tree
        env.mock_auths(&[&escrow]);

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

        env.mock_auths(&[&escrow]);

        let species = String::from_str(&env, "Baobab");
        let region = String::from_str(&env, "Kaduna");

        let id = client.mint_tree(&sponsor, &species, &region, &planter);

        // Assert the TreeMinted event was published with expected payload
        env.events().assert_published((Symbol::new(&env, "TreeMinted"), id), (sponsor, species, region, planter));
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
        env.mock_auths(&[&escrow, &sponsor]);

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
        env.mock_auths(&[&escrow, &sponsor]);

        let species = String::from_str(&env, "Teak");
        let region = String::from_str(&env, "Lagos");
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);

        let planted_at = env.ledger().timestamp();
        env.ledger().set_timestamp(planted_at + ONE_YEAR_SECS * 5 + 1);

        let amount = client.claim_milestone(&sponsor, &tree_id, &5);
        assert_eq!(amount, CO2_KG_PER_YEAR * 5);
        env.events().assert_published(
            (Symbol::new(&env, "MilestoneClaimed"), tree_id),
            (sponsor, 5u64, amount),
        );

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
        env.mock_auths(&[&escrow, &sponsor]);

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
        env.mock_auths(&[&escrow, &sponsor]);

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
        env.mock_auths(&[&escrow, &other]);

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
        env.mock_auths(&[&escrow, &sponsor]);

        let species = String::from_str(&env, "Mahogany");
        let region = String::from_str(&env, "Dar es Salaam");
        let tree_id = client.mint_tree(&sponsor, &species, &region, &planter);

        let planted_at = env.ledger().timestamp();
        env.ledger().set_timestamp(planted_at + ONE_YEAR_SECS + 1);

        client.claim_milestone(&sponsor, &tree_id, &1);
        client.claim_milestone(&sponsor, &tree_id, &1);
    }
}
