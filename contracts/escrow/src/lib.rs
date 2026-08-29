//! Verifier-controlled token escrow for tree planting outcomes.
//!
//! The release path is deliberately authorization-gated: only the configured
//! verifier can settle a pending escrow. Public transaction visibility cannot
//! let an observer forge that authorization. `batch_release` lets the verifier
//! settle several independent escrows in one transaction, reducing ordering
//! and timing surface for relayers while preserving per-escrow accounting.

use admin_controls::AdminControlsClient;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, Env, IntoVal, Symbol, Vec,
};

const REFUND_WINDOW: u64 = 90 * 24 * 60 * 60;
const MAX_FEE_BPS: u32 = 10_000;
const BPS_DENOM: i128 = 10_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AmountMustBePositive = 3,
    EscrowAlreadyFunded = 4,
    EscrowNotFound = 5,
    EscrowAlreadySettled = 6,
    RefundWindowNotOpen = 7,
    InsufficientDonation = 8,
    NoPlantersAvailable = 9,
    InvalidSpecies = 10,
    TreeRegistryNotSet = 11,
    PlanterRegistryNotSet = 12,
    TreeMintingFailed = 13,
    PlatformFeeBpsOutOfRange = 14,
    PlatformFeeTreasuryNotSet = 15,
    UnauthorizedAdmin = 16,
    BatchEmpty = 17,
    BatchTooLarge = 18,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    Pending,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct EscrowRecord {
    pub sponsor: Option<Address>,
    pub planter: Address,
    pub token: Address,
    pub amount: i128,
    pub deposit_time: u64,
    pub status: EscrowStatus,
    pub species: Option<Symbol>,
    pub region: Option<Symbol>,
    pub is_anonymous: bool,
}

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    /// Configure the verifier and admin-controls contract. Can only be called once.
    pub fn initialize(env: Env, admin: Address, verifier: Address, admin_controls: Address) {
        if env.storage().instance().has(&symbol_short!("VERIFIER")) {
            panic_with_error!(&env, EscrowError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("ADMIN"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("VERIFIER"), &verifier);
        env.storage()
            .instance()
            .set(&symbol_short!("ADMC"), &admin_controls);
    }

    /// Configure registry addresses. Only the verifier may call this.
    pub fn initialize_registries(env: Env, tree_registry: Address, planter_registry: Address) {
        Self::require_verifier(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("TREE_REG"), &tree_registry);
        env.storage()
            .instance()
            .set(&symbol_short!("PLANT_REG"), &planter_registry);
    }

    /// Update the platform fee in basis points. Admin-only.
    pub fn set_fee_bps(env: Env, bps: u32) {
        Self::require_admin(&env);
        if bps > MAX_FEE_BPS {
            panic_with_error!(&env, EscrowError::PlatformFeeBpsOutOfRange);
        }
        env.storage()
            .instance()
            .set(&symbol_short!("FEE_BPS"), &bps);
        env.events()
            .publish((symbol_short!("FeeUpd"),), (bps, env.ledger().timestamp()));
    }

    /// Rotate the platform treasury address. Admin-only.
    pub fn set_treasury(env: Env, treasury: Address) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&symbol_short!("TREASURY"), &treasury);
        env.events().publish(
            (symbol_short!("TreasUpd"),),
            (treasury, env.ledger().timestamp()),
        );
    }

    pub fn get_fee_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("FEE_BPS"))
            .unwrap_or(0)
    }

    pub fn get_treasury(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("TREASURY"))
            .unwrap_or_else(|| panic_with_error!(&env, EscrowError::PlatformFeeTreasuryNotSet))
    }

    /// Lock tokens against a tree identifier.
    pub fn deposit(
        env: Env,
        sponsor: Address,
        planter: Address,
        tree_id: u64,
        token: Address,
        amount: i128,
    ) {
        Self::assert_not_paused(&env);
        sponsor.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, EscrowError::AmountMustBePositive);
        }
        let key = Self::escrow_key(&env, tree_id);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, EscrowError::EscrowAlreadyFunded);
        }
        token::Client::new(&env, &token).transfer(
            &sponsor,
            &env.current_contract_address(),
            &amount,
        );
        env.storage().persistent().set(
            &key,
            &EscrowRecord {
                sponsor: Some(sponsor.clone()),
                planter,
                token: token.clone(),
                amount,
                deposit_time: env.ledger().timestamp(),
                status: EscrowStatus::Pending,
                species: None,
                region: None,
                is_anonymous: false,
            },
        );
        env.events().publish(
            (symbol_short!("FundsDep"), tree_id),
            (sponsor, token, amount),
        );
    }

    /// Deposit an anonymous species donation and assign it to an available planter.
    pub fn donate_anonymous(
        env: Env,
        sponsor: Address,
        amount: i128,
        token: Address,
        species: Symbol,
        region: Symbol,
    ) -> (u64, Address) {
        Self::assert_not_paused(&env);
        sponsor.require_auth();
        let species_cost = Self::get_species_cost(env.clone(), species.clone());
        if amount < species_cost {
            panic_with_error!(&env, EscrowError::InsufficientDonation);
        }
        let planter = Self::assign_planter(&env, region.clone());
        token::Client::new(&env, &token).transfer(
            &sponsor,
            &env.current_contract_address(),
            &amount,
        );
        let tree_id =
            Self::mint_anonymous_tree(&env, species.clone(), region.clone(), planter.clone());
        let key = Self::escrow_key(&env, tree_id);
        env.storage().persistent().set(
            &key,
            &EscrowRecord {
                sponsor: None,
                planter: planter.clone(),
                token: token.clone(),
                amount,
                deposit_time: env.ledger().timestamp(),
                status: EscrowStatus::Pending,
                species: Some(species.clone()),
                region: Some(region.clone()),
                is_anonymous: true,
            },
        );
        Self::increment_planter_workload(&env, planter.clone());
        env.events().publish(
            (symbol_short!("AnonDep"), tree_id),
            (species, region, amount, token, planter.clone()),
        );
        (tree_id, planter)
    }

    /// Release one pending escrow. Only the configured verifier may authorize it.
    pub fn release(env: Env, tree_id: u64) {
        Self::assert_not_paused(&env);
        Self::require_verifier(&env);
        Self::release_one(&env, tree_id);
    }

    /// Release multiple pending escrows atomically under one verifier authorization.
    ///
    /// The verifier signs the complete ordered list. A caller cannot append or
    /// replace IDs without invalidating that authorization, and any failure
    /// reverts the whole batch. The maximum keeps resource usage predictable.
    pub fn batch_release(env: Env, tree_ids: Vec<u64>) {
        Self::assert_not_paused(&env);
        Self::require_verifier(&env);
        if tree_ids.is_empty() {
            panic_with_error!(&env, EscrowError::BatchEmpty);
        }
        if tree_ids.len() > 64 {
            panic_with_error!(&env, EscrowError::BatchTooLarge);
        }
        for tree_id in tree_ids.iter() {
            Self::release_one(&env, tree_id);
        }
        env.events().publish(
            (symbol_short!("BatchRel"),),
            (tree_ids.len(), env.ledger().timestamp()),
        );
    }

    /// Refund a pending escrow to its original sponsor after the refund window.
    pub fn refund(env: Env, tree_id: u64) {
        Self::assert_not_paused(&env);
        let key = Self::escrow_key(&env, tree_id);
        let mut record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, EscrowError::EscrowNotFound));
        if record.status != EscrowStatus::Pending {
            panic_with_error!(&env, EscrowError::EscrowAlreadySettled);
        }
        let sponsor = record
            .sponsor
            .clone()
            .unwrap_or_else(|| panic_with_error!(&env, EscrowError::EscrowAlreadySettled));
        sponsor.require_auth();
        if env.ledger().timestamp().saturating_sub(record.deposit_time) < REFUND_WINDOW {
            panic_with_error!(&env, EscrowError::RefundWindowNotOpen);
        }
        token::Client::new(&env, &record.token).transfer(
            &env.current_contract_address(),
            &sponsor,
            &record.amount,
        );
        record.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &record);
        env.events().publish(
            (symbol_short!("FundsRef"), tree_id),
            (sponsor, record.amount),
        );
    }

    pub fn get_escrow(env: Env, tree_id: u64) -> Option<EscrowRecord> {
        env.storage()
            .persistent()
            .get(&Self::escrow_key(&env, tree_id))
    }

    pub fn get_species_cost(env: Env, species: Symbol) -> i128 {
        if species == symbol_short!("teak") {
            50_0000000
        } else if species == symbol_short!("moringa") {
            10_0000000
        } else if species == Symbol::new(&env, "eucalyptus") {
            35_0000000
        } else if species == symbol_short!("mangrove") {
            25_0000000
        } else if species == symbol_short!("acacia") {
            15_0000000
        } else if species == symbol_short!("bamboo") {
            8_0000000
        } else {
            panic_with_error!(&env, EscrowError::InvalidSpecies)
        }
    }

    fn release_one(env: &Env, tree_id: u64) {
        let key = Self::escrow_key(env, tree_id);
        let mut record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::EscrowNotFound));
        if record.status != EscrowStatus::Pending {
            panic_with_error!(env, EscrowError::EscrowAlreadySettled);
        }
        let fee_bps = Self::fee_bps(env);
        let fee = record
            .amount
            .checked_mul(fee_bps as i128)
            .expect("fee overflow")
            .checked_div(BPS_DENOM)
            .expect("fee division error");
        let planter_amount = record
            .amount
            .checked_sub(fee)
            .expect("planter amount underflow");
        if fee > 0 {
            let treasury = Self::get_treasury(env.clone());
            token::Client::new(env, &record.token).transfer(
                &env.current_contract_address(),
                &treasury,
                &fee,
            );
            env.events().publish(
                (symbol_short!("FeeColl"), tree_id),
                (treasury, fee, fee_bps),
            );
        }
        token::Client::new(env, &record.token).transfer(
            &env.current_contract_address(),
            &record.planter,
            &planter_amount,
        );
        record.status = EscrowStatus::Released;
        env.storage().persistent().set(&key, &record);
        if record.is_anonymous {
            Self::decrement_planter_workload(env, record.planter.clone());
        }
        env.events().publish(
            (symbol_short!("FundsRel"), tree_id),
            (record.planter, planter_amount),
        );
    }

    fn assign_planter(env: &Env, region: Symbol) -> Address {
        let registry: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("PLANT_REG"))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::PlanterRegistryNotSet));
        let planters: Vec<Address> = env.invoke_contract(
            &registry,
            &symbol_short!("get_avail"),
            Vec::from_array(env, [region.into_val(env)]),
        );
        if planters.is_empty() {
            panic_with_error!(env, EscrowError::NoPlantersAvailable);
        }
        planters.get(0).unwrap()
    }

    fn mint_anonymous_tree(env: &Env, species: Symbol, region: Symbol, planter: Address) -> u64 {
        let registry: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("TREE_REG"))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::TreeRegistryNotSet));
        env.invoke_contract(
            &registry,
            &symbol_short!("mint_anon"),
            Vec::from_array(
                env,
                [
                    species.into_val(env),
                    region.into_val(env),
                    planter.into_val(env),
                ],
            ),
        )
    }

    fn increment_planter_workload(env: &Env, planter: Address) {
        let registry: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("PLANT_REG"))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::PlanterRegistryNotSet));
        env.invoke_contract::<()>(
            &registry,
            &symbol_short!("inc_work"),
            Vec::from_array(env, [planter.into_val(env)]),
        );
    }

    fn decrement_planter_workload(env: &Env, planter: Address) {
        let registry: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("PLANT_REG"))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::PlanterRegistryNotSet));
        env.invoke_contract::<()>(
            &registry,
            &symbol_short!("dec_work"),
            Vec::from_array(env, [planter.into_val(env)]),
        );
    }

    fn escrow_key(env: &Env, tree_id: u64) -> soroban_sdk::Val {
        (symbol_short!("ESC"), tree_id).into_val(env)
    }

    fn admin_controls(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&symbol_short!("ADMC"))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::NotInitialized))
    }

    fn assert_not_paused(env: &Env) {
        AdminControlsClient::new(env, &Self::admin_controls(env)).assert_not_paused();
    }

    fn require_verifier(env: &Env) {
        let verifier: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("VERIFIER"))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::NotInitialized));
        verifier.require_auth();
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("ADMIN"))
            .unwrap_or_else(|| panic_with_error!(env, EscrowError::UnauthorizedAdmin));
        admin.require_auth();
    }

    fn fee_bps(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("FEE_BPS"))
            .unwrap_or(0)
    }
}
