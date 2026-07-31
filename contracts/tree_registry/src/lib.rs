#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tree {
    pub id: u64,
    pub sponsor: Option<Address>,
    pub planter: Address,
    pub species: Symbol,
    pub region: Symbol,
    pub planted_at: u64,
    pub status: TreeStatus,
    pub photo_cid: Option<Symbol>,
    pub gps_lat: Option<i64>,
    pub gps_lon: Option<i64>,
    pub co2_offset_kg: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TreeStatus {
    Assigned,
    Planted,
    Verified,
    Mature,
    Failed,
}

#[contracttype]
pub enum DataKey {
    Tree(u64),
    NextTreeId,
    SponsorTrees(Address),
    PlanterTrees(Address),
    TotalTrees,
    TotalAnonymousTrees,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    TreeNotFound = 1,
    InvalidPlanter = 2,
    Unauthorized = 3,
    TreeAlreadyPlanted = 4,
    InvalidCoordinates = 5,
}

#[contract]
pub struct TreeRegistryContract;

#[contractimpl]
impl TreeRegistryContract {
    pub fn initialize(env: Env) {
        env.storage().instance().set(&DataKey::NextTreeId, &1u64);
        env.storage().instance().set(&DataKey::TotalTrees, &0u64);
        env.storage().instance().set(&DataKey::TotalAnonymousTrees, &0u64);
    }

    pub fn mint_anon(
        env: Env,
        species: Symbol,
        region: Symbol,
        planter: Address,
    ) -> u64 {
        let escrow = Self::get_escrow_address(&env);
        escrow.require_auth();
        let tree_id = Self::get_next_tree_id(&env);
        let co2 = Self::get_co2_for_species(&env, species);
        let tree = Tree {
            id: tree_id,
            sponsor: None,
            planter: planter.clone(),
            species,
            region,
            planted_at: env.ledger().timestamp(),
            status: TreeStatus::Assigned,
            photo_cid: None,
            gps_lat: None,
            gps_lon: None,
            co2_offset_kg: co2,
        };
        env.storage().persistent().set(&DataKey::Tree(tree_id), &tree);
        let mut planter_trees: Vec<u64> = env.storage().persistent().get(&DataKey::PlanterTrees(planter.clone())).unwrap_or(Vec::new(&env));
        planter_trees.push_back(tree_id);
        env.storage().persistent().set(&DataKey::PlanterTrees(planter.clone()), &planter_trees);
        let total: u64 = env.storage().instance().get(&DataKey::TotalTrees).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalTrees, &(total + 1));
        let anon_total: u64 = env.storage().instance().get(&DataKey::TotalAnonymousTrees).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalAnonymousTrees, &(anon_total + 1));
        env.events().publish((symbol_short!("anon_minted"),), (tree_id, species, region, planter));
        env.storage().instance().set(&DataKey::NextTreeId, &(tree_id + 1));
        tree_id
    }

    pub fn mint_sponsored(
        env: Env,
        sponsor: Address,
        planter: Address,
        species: Symbol,
        region: Symbol,
    ) -> u64 {
        sponsor.require_auth();
        let tree_id = Self::get_next_tree_id(&env);
        let co2 = Self::get_co2_for_species(&env, species);
        let tree = Tree {
            id: tree_id,
            sponsor: Some(sponsor.clone()),
            planter: planter.clone(),
            species,
            region,
            planted_at: env.ledger().timestamp(),
            status: TreeStatus::Assigned,
            photo_cid: None,
            gps_lat: None,
            gps_lon: None,
            co2_offset_kg: co2,
        };
        env.storage().persistent().set(&DataKey::Tree(tree_id), &tree);
        let mut sponsor_trees: Vec<u64> = env.storage().persistent().get(&DataKey::SponsorTrees(sponsor.clone())).unwrap_or(Vec::new(&env));
        sponsor_trees.push_back(tree_id);
        env.storage().persistent().set(&DataKey::SponsorTrees(sponsor.clone()), &sponsor_trees);
        let mut planter_trees: Vec<u64> = env.storage().persistent().get(&DataKey::PlanterTrees(planter.clone())).unwrap_or(Vec::new(&env));
        planter_trees.push_back(tree_id);
        env.storage().persistent().set(&DataKey::PlanterTrees(planter.clone()), &planter_trees);
        let total: u64 = env.storage().instance().get(&DataKey::TotalTrees).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalTrees, &(total + 1));
        env.events().publish((symbol_short!("tree_minted"),), (tree_id, sponsor, planter, species));
        env.storage().instance().set(&DataKey::NextTreeId, &(tree_id + 1));
        tree_id
    }

    pub fn get_sponsor_trees(env: Env, sponsor: Address) -> Vec<Tree> {
        let tree_ids: Vec<u64> = env.storage().persistent().get(&DataKey::SponsorTrees(sponsor)).unwrap_or(Vec::new(&env));
        let mut trees = Vec::new(&env);
        for id in tree_ids.iter() {
            if let Some(tree) = env.storage().persistent().get(&DataKey::Tree(id)) {
                trees.push_back(tree);
            }
        }
        trees
    }

    pub fn get_tree(env: Env, tree_id: u64) -> Option<Tree> {
        env.storage().persistent().get(&DataKey::Tree(tree_id))
    }

    pub fn get_planter_trees(env: Env, planter: Address) -> Vec<Tree> {
        let tree_ids: Vec<u64> = env.storage().persistent().get(&DataKey::PlanterTrees(planter)).unwrap_or(Vec::new(&env));
        let mut trees = Vec::new(&env);
        for id in tree_ids.iter() {
            if let Some(tree) = env.storage().persistent().get(&DataKey::Tree(id)) {
                trees.push_back(tree);
            }
        }
        trees
    }

    pub fn update_status(env: Env, tree_id: u64, new_status: TreeStatus) -> Result<(), Error> {
        let mut tree: Tree = env.storage().persistent().get(&DataKey::Tree(tree_id)).ok_or(Error::TreeNotFound)?;
        tree.planter.require_auth();
        tree.status = new_status;
        env.storage().persistent().set(&DataKey::Tree(tree_id), &tree);
        env.events().publish((symbol_short!("status_upd"),), (tree_id, new_status));
        Ok(())
    }

    pub fn upload_proof(env: Env, tree_id: u64, photo_cid: Symbol, gps_lat: i64, gps_lon: i64) -> Result<(), Error> {
        let mut tree: Tree = env.storage().persistent().get(&DataKey::Tree(tree_id)).ok_or(Error::TreeNotFound)?;
        tree.planter.require_auth();
        if gps_lat < -90_000000 || gps_lat > 90_000000 {
            return Err(Error::InvalidCoordinates);
        }
        if gps_lon < -180_000000 || gps_lon > 180_000000 {
            return Err(Error::InvalidCoordinates);
        }
        tree.photo_cid = Some(photo_cid);
        tree.gps_lat = Some(gps_lat);
        tree.gps_lon = Some(gps_lon);
        tree.status = TreeStatus::Planted;
        env.storage().persistent().set(&DataKey::Tree(tree_id), &tree);
        env.events().publish((symbol_short!("proof_upd"),), (tree_id, photo_cid, gps_lat, gps_lon));
        Ok(())
    }

    pub fn get_total_trees(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::TotalTrees).unwrap_or(0)
    }

    pub fn get_total_anonymous_trees(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::TotalAnonymousTrees).unwrap_or(0)
    }

    pub fn get_next_tree_id(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextTreeId).unwrap_or(1)
    }

    fn get_co2_for_species(env: &Env, species: Symbol) -> u64 {
        if species == symbol_short!("teak") { 22 }
        else if species == symbol_short!("moringa") { 9 }
        else if species == symbol_short!("eucalyptus") { 31 }
        else if species == symbol_short!("mangrove") { 14 }
        else if species == symbol_short!("acacia") { 18 }
        else if species == symbol_short!("bamboo") { 12 }
        else { 15 }
    }

    fn get_escrow_address(env: &Env) -> Address {
        env.storage().instance().get(&symbol_short!("escrow")).unwrap()
    }

    pub fn set_escrow_address(env: Env, escrow: Address) {
        env.storage().instance().set(&symbol_short!("escrow"), &escrow);
    }
}