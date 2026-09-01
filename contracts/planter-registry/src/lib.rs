#![no_std]

//! Planter Registry Contract — Closes #459, #488
//!
//! Planters must register on-chain before accepting jobs.
//! Tracks reputation scores that can be incremented (by escrow on successful
//! completion) or slashed (on dispute resolution). A minimum score threshold
//! can be checked before high-value job acceptance.
//!
//! #488 additions:
//! - Region bounding box registration (microdegrees)
//! - On-chain GPS validation to ensure submitted coordinates fall within the planter's declared region

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short,
    token, Address, BytesN, Env, String, Vec,
};
use harvesta_errors::HarvestaError;
use admin_controls::AdminControlsClient;

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AlreadyRegistered = 3,
    NotRegistered = 4,
    NotAuthorized = 5,
    CapacityExceeded = 6,
    PlanterInactive = 7,
    WorkloadAlreadyZero = 8,
    EscrowNotSet = 9,
    PointOutsideRegion = 10,
    RegionBoundsNotFound = 11,
    InvalidBoundingBox = 12,
}

// ── Constants ─────────────────────────────────────────────────────────────────

pub const INITIAL_SCORE: u32 = 100;
pub const SCORE_INCREMENT: u32 = 10;
pub const SCORE_SLASH: u32 = 20;

pub const TIER_PLATINUM_MIN: u32 = 900;
pub const TIER_GOLD_MIN: u32 = 600;
pub const TIER_SILVER_MIN: u32 = 300;

pub const DISCOUNT_BRONZE_BPS: u32 = 0;
pub const DISCOUNT_SILVER_BPS: u32 = 500;
pub const DISCOUNT_GOLD_BPS: u32 = 1500;
pub const DISCOUNT_PLATINUM_BPS: u32 = 3000;

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ReputationTier {
    Bronze,
    Silver,
    Gold,
    Platinum,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PlanterRecord {
    pub wallet: Address,
    pub name_hash: BytesN<32>,
    pub region: String,
    pub score: u32,
    pub registered_at: u64,
    pub capacity: u32,
    pub workload: u32,
    pub active: bool,
    pub total_trees_planted: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PlanterStake {
    pub planter: Address,
    pub token: Address,
    pub amount: i128,
    pub staked_at: u64,
    pub slashed: i128,
}

/// Bounding box representation in microdegrees (millionths of a degree).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct BoundingBox {
    pub lat_min: i32,
    pub lat_max: i32,
    pub lon_min: i32,
    pub lon_max: i32,
}

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Config,
    Stake(Address),
    Planter(Address),
    RegionPlanters(String),
    RegionBounds(String),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct PlanterRegistry;

#[contractimpl]
impl PlanterRegistry {
    pub fn initialize(env: Env, admin: Address, stake_token: Address, min_stake_amount: i128) {
        if env.storage().instance().has(&DataKey::Config) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        if min_stake_amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }
        env.storage()
            .instance()
            .set(&DataKey::Config, &(admin, stake_token, min_stake_amount));
    }

    pub fn set_escrow(env: Env, escrow: Address) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("ESCROW"), &escrow);
    }

    // ── Region Bounding Boxes (#488) ──────────────────────────────────────────

    /// Sets or updates the bounding box for a region.
    pub fn set_region_bounds(env: Env, region: String, bounds: BoundingBox) {
        Self::require_admin(&env);

        if bounds.lat_min > bounds.lat_max || bounds.lon_min > bounds.lon_max {
            panic_with_error!(&env, Error::InvalidBoundingBox);
        }

        env.storage()
            .persistent()
            .set(&DataKey::RegionBounds(region.clone()), &bounds);

        env.events().publish(
            (symbol_short!("BBoxSet"), region),
            bounds,
        );
    }

    /// Returns the registered bounding box for a region.
    pub fn get_region_bounds(env: Env, region: String) -> Option<BoundingBox> {
        env.storage()
            .persistent()
            .get(&DataKey::RegionBounds(region))
    }

    /// Validates that given GPS coordinates fall within the declared region bounding box.
    pub fn validate_gps_in_region(env: Env, planter: Address, lat: i32, lon: i32) -> bool {
        let record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Planter(planter))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        let bounds: BoundingBox = env
            .storage()
            .persistent()
            .get(&DataKey::RegionBounds(record.region))
            .unwrap_or_else(|| panic_with_error!(&env, Error::RegionBoundsNotFound));

        if lat < bounds.lat_min || lat > bounds.lat_max || lon < bounds.lon_min || lon > bounds.lon_max {
            panic_with_error!(&env, Error::PointOutsideRegion);
        }

        true
    }

    // ── Planter Registration & Management ─────────────────────────────────────

    pub fn stake_to_apply(env: Env, planter: Address, amount: i128) {
        planter.require_auth();

        if amount <= 0 {
            panic_with_error!(&env, HarvestaError::AmountMustBePositive);
        }

        let (_, stake_token, min_stake): (Address, Address, i128) = Self::config(&env);
        let key = DataKey::Stake(planter.clone());

        if env.storage().persistent().has(&key) {
            let mut rec: PlanterStake = env.storage().persistent().get(&key).unwrap();
            rec.amount += amount;
            token::Client::new(&env, &stake_token).transfer(
                &planter,
                &env.current_contract_address(),
                &amount,
            );
            env.storage().persistent().set(&key, &rec);
        } else {
            if amount < min_stake {
                panic_with_error!(&env, Error::NotAuthorized);
            }
            token::Client::new(&env, &stake_token).transfer(
                &planter,
                &env.current_contract_address(),
                &amount,
            );
            env.storage().persistent().set(
                &key,
                &PlanterStake {
                    planter: planter.clone(),
                    token: stake_token,
                    amount,
                    staked_at: env.ledger().timestamp(),
                    slashed: 0,
                },
            );
        }

        env.events().publish((symbol_short!("staked"), planter), amount);
    }

    pub fn unstake(env: Env, planter: Address) {
        planter.require_auth();

        let key = DataKey::Stake(planter.clone());
        let rec: PlanterStake = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        let amount = rec.amount;
        if amount > 0 {
            token::Client::new(&env, &rec.token).transfer(
                &env.current_contract_address(),
                &planter,
                &amount,
            );
        }

        env.storage().persistent().remove(&key);
        env.events().publish((symbol_short!("unstaked"), planter), amount);
    }

    pub fn register_planter(
        env: Env,
        wallet: Address,
        name_hash: BytesN<32>,
        region: String,
    ) -> PlanterRecord {
        wallet.require_auth();

        if env.storage().persistent().has(&DataKey::Planter(wallet.clone())) {
            panic_with_error!(&env, Error::AlreadyRegistered);
        }

        let record = PlanterRecord {
            wallet: wallet.clone(),
            name_hash,
            region: region.clone(),
            score: INITIAL_SCORE,
            registered_at: env.ledger().timestamp(),
            capacity: 10,
            workload: 0,
            active: true,
            total_trees_planted: 0,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Planter(wallet.clone()), &record);

        let mut region_planters: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::RegionPlanters(region.clone()))
            .unwrap_or(Vec::new(&env));
        region_planters.push_back(wallet.clone());
        env.storage()
            .persistent()
            .set(&DataKey::RegionPlanters(region), &region_planters);

        env.events().publish(
            (symbol_short!("PlantReg"), wallet),
            record.clone(),
        );

        record
    }

    pub fn get_planter(env: Env, wallet: Address) -> Option<PlanterRecord> {
        env.storage().persistent().get(&DataKey::Planter(wallet))
    }

    pub fn increment_score(env: Env, wallet: Address) {
        Self::require_admin(&env);

        let key = DataKey::Planter(wallet.clone());
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        record.score = record.score.saturating_add(SCORE_INCREMENT);
        env.storage().persistent().set(&key, &record);

        env.events().publish((symbol_short!("ScoreInc"), wallet), record.score);
    }

    pub fn slash_score(env: Env, wallet: Address) {
        Self::require_admin(&env);

        let key = DataKey::Planter(wallet.clone());
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        record.score = record.score.saturating_sub(SCORE_SLASH);
        env.storage().persistent().set(&key, &record);

        env.events().publish((symbol_short!("ScoreSls"), wallet), record.score);
    }

    pub fn meets_min_score(env: Env, wallet: Address, min_score: u32) -> bool {
        match env.storage().persistent().get::<_, PlanterRecord>(&DataKey::Planter(wallet)) {
            Some(record) => record.score >= min_score,
            None => false,
        }
    }

    pub fn get_avail(env: Env, region: String) -> Vec<Address> {
        let region_planters: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::RegionPlanters(region))
            .unwrap_or(Vec::new(&env));

        let mut available = Vec::new(&env);
        for addr in region_planters.iter() {
            if let Some(planter) = env
                .storage()
                .persistent()
                .get::<_, PlanterRecord>(&DataKey::Planter(addr.clone()))
            {
                if planter.active && planter.workload < planter.capacity {
                    available.push_back(addr);
                }
            }
        }
        available
    }

    pub fn inc_work(env: Env, wallet: Address) {
        Self::require_escrow(&env);

        let key = DataKey::Planter(wallet.clone());
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        if !record.active {
            panic_with_error!(&env, Error::PlanterInactive);
        }
        if record.workload >= record.capacity {
            panic_with_error!(&env, Error::CapacityExceeded);
        }

        record.workload += 1;
        env.storage().persistent().set(&key, &record);
        env.events().publish((symbol_short!("WorkInc"), wallet), record.workload);
    }

    pub fn dec_work(env: Env, wallet: Address) {
        Self::require_escrow(&env);

        let key = DataKey::Planter(wallet.clone());
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        if record.workload == 0 {
            panic_with_error!(&env, Error::WorkloadAlreadyZero);
        }

        record.workload -= 1;
        record.total_trees_planted += 1;
        env.storage().persistent().set(&key, &record);
        env.events().publish((symbol_short!("WorkDec"), wallet), record.workload);
    }

    pub fn set_active(env: Env, wallet: Address, active: bool) {
        Self::require_admin(&env);

        let key = DataKey::Planter(wallet.clone());
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        record.active = active;
        env.storage().persistent().set(&key, &record);
        env.events().publish((symbol_short!("ActiveSet"), wallet), active);
    }

    pub fn set_capacity(env: Env, wallet: Address, capacity: u32) {
        Self::require_admin(&env);

        let key = DataKey::Planter(wallet.clone());
        let mut record: PlanterRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotRegistered));

        record.capacity = capacity;
        env.storage().persistent().set(&key, &record);
    }

    pub fn get_planters_by_region(env: Env, region: String) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::RegionPlanters(region))
            .unwrap_or(Vec::new(&env))
    }

    // ── Internal Helpers ──────────────────────────────────────────────────────

    fn config(env: &Env) -> (Address, Address, i128) {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn require_admin(env: &Env) {
        let (admin, _, _): (Address, Address, i128) = Self::config(env);
        admin.require_auth();
    }

    fn require_escrow(env: &Env) {
        let escrow: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ESCROW"))
            .unwrap_or_else(|| panic_with_error!(env, Error::EscrowNotSet));
        escrow.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env, String};

    struct Ctx {
        env: Env,
        admin: Address,
        planter: Address,
        token: Address,
        client: PlanterRegistryClient<'static>,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PlanterRegistry);
        let client = PlanterRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let planter = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();

        token::StellarAssetClient::new(&env, &token).mint(&planter, &10_000);
        client.initialize(&admin, &token, &1_000);

        Ctx {
            env,
            admin,
            planter,
            token,
            client,
        }
    }

    fn name_hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    #[test]
    fn test_register_and_get() {
        let ctx = setup();
        let record = ctx.client.register_planter(
            &ctx.planter,
            &name_hash(&ctx.env, 1),
            &String::from_str(&ctx.env, "kaduna"),
        );

        assert_eq!(record.wallet, ctx.planter);
        assert_eq!(record.score, INITIAL_SCORE);
        assert_eq!(record.capacity, 10);
        assert_eq!(record.workload, 0);
        assert_eq!(record.active, true);

        let stored = ctx.client.get_planter(&ctx.planter).unwrap();
        assert_eq!(stored.region, String::from_str(&ctx.env, "kaduna"));
    }

    // ── #488 Geographic Proof Tests ──────────────────────────────────────────

    #[test]
    fn test_set_and_get_region_bounds() {
        let ctx = setup();
        let region = String::from_str(&ctx.env, "kaduna");
        let bbox = BoundingBox {
            lat_min: 9_000_000,
            lat_max: 11_500_000,
            lon_min: 6_000_000,
            lon_max: 9_000_000,
        };

        ctx.client.set_region_bounds(&region, &bbox);
        let retrieved = ctx.client.get_region_bounds(&region).unwrap();
        assert_eq!(retrieved, bbox);
    }

    #[test]
    fn test_validate_gps_within_region_succeeds() {
        let ctx = setup();
        let region = String::from_str(&ctx.env, "kaduna");
        let bbox = BoundingBox {
            lat_min: 9_000_000,
            lat_max: 11_500_000,
            lon_min: 6_000_000,
            lon_max: 9_000_000,
        };

        ctx.client.set_region_bounds(&region, &bbox);
        ctx.client.register_planter(&ctx.planter, &name_hash(&ctx.env, 1), &region);

        // Center point: (10.0°N, 7.5°E)
        let is_valid = ctx.client.validate_gps_in_region(&ctx.planter, &10_000_000, &7_500_000);
        assert!(is_valid);

        // Edge boundaries:
        assert!(ctx.client.validate_gps_in_region(&ctx.planter, &9_000_000, &6_000_000));
        assert!(ctx.client.validate_gps_in_region(&ctx.planter, &11_500_000, &9_000_000));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_validate_gps_outside_region_fails() {
        let ctx = setup();
        let region = String::from_str(&ctx.env, "kaduna");
        let bbox = BoundingBox {
            lat_min: 9_000_000,
            lat_max: 11_500_000,
            lon_min: 6_000_000,
            lon_max: 9_000_000,
        };

        ctx.client.set_region_bounds(&region, &bbox);
        ctx.client.register_planter(&ctx.planter, &name_hash(&ctx.env, 1), &region);

        // Point outside: (12.0°N, 7.5°E)
        ctx.client.validate_gps_in_region(&ctx.planter, &12_000_000, &7_500_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_validate_gps_missing_region_bounds_fails() {
        let ctx = setup();
        let region = String::from_str(&ctx.env, "unregistered_region");
        ctx.client.register_planter(&ctx.planter, &name_hash(&ctx.env, 1), &region);

        ctx.client.validate_gps_in_region(&ctx.planter, &10_000_000, &7_500_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_invalid_bounding_box_rejected() {
        let ctx = setup();
        let region = String::from_str(&ctx.env, "inverted");
        let invalid_bbox = BoundingBox {
            lat_min: 11_000_000,
            lat_max: 9_000_000, // min > max
            lon_min: 6_000_000,
            lon_max: 9_000_000,
        };

        ctx.client.set_region_bounds(&region, &invalid_bbox);
    }
}