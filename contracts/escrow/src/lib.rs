#![no_std]

//! Escrow Contract — with configurable Platform Fee on Release (#467)
//! and Sponsor Insurance Guarantee (#1021)
//!
//! ## Standard flow
//!   1. `initialize(verifier, admin, treasury, fee_bps)` — one-time setup.
//!      - `verifier` is the only party that may call `release()` (oracle/admin).
//!      - `admin` is a separate governance role that may adjust the platform fee
//!        or rotate the treasury address. Splitting these is deliberate so a
//!        compromised verifier cannot redirect future releases to an attacker.
//!      - `treasury` receives the platform fee on every release.
//!      - `fee_bps` is the fee in basis points (e.g. `200` = 2.00%).
//!   2. Sponsor calls `deposit(...)` or `deposit_with_insurance(...)` — funds locked against a `tree_id`.
//!      - Optional 1-year survival guarantee (+2% insurance fee).
//!   3. Verifier/oracle calls `release(tree_id)` → fee is transferred to the
//!      treasury, the remainder is transferred to the planter, the record
//!      transitions to `Released`. Two events are emitted:
//!        - `FundsRel(tree_id)` with `(planter, planter_amount)` — shape is
//!          preserved for existing indexers. `planter_amount` is the net
//!          payout (i.e. `total - fee`).
//!        - `FeeColl(tree_id)` with `(treasury, fee_amount)` — the fee leg.
//!   4. After 90 days sponsor may call `refund(tree_id)` — refund ignores the
//!      fee entirely (no deduction on the way back to the sponsor).
//!   5. If an insured tree dies within 1 year, sponsor calls `claim_insurance_refund(tree_id)`
//!      or verifier calls `report_tree_dead(tree_id)` to receive a full refund of deposit amount.
//! Verifier-controlled token escrow for tree planting outcomes.
//!
//! The release path is deliberately authorization-gated: only the configured
//! verifier can settle a pending escrow. Public transaction visibility cannot
//! let an observer forge that authorization. `batch_release` lets the verifier
//! settle several independent escrows in one transaction, reducing ordering
//! and timing surface for relayers while preserving per-escrow accounting.

use admin_controls::AdminControlsClient;
use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, panic_with_error,
    symbol_short, token, Address, Env, IntoVal, Symbol, Vec,
};

const REFUND_WINDOW: u64 = 90 * 24 * 60 * 60;

/// 1 year in seconds (365 days)
const ONE_YEAR_SECS: u64 = 365 * 24 * 60 * 60;

/// Default platform fee: 2.00% (200 basis points)
const DEFAULT_FEE_BPS: u32 = 200;

/// Sponsor insurance guarantee fee: +2.00% (200 basis points)
const INSURANCE_FEE_BPS: u32 = 200;

/// Maximum allowed platform fee: 100% (10,000 basis points)
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
    PlatformFeeBpsOutOfRange = 8,
    PlatformFeeTreasuryNotSet = 9,
    UnauthorizedAdmin = 10,
    InsufficientDonation = 11,
    NoPlantersAvailable = 12,
    InvalidSpecies = 13,
    TreeRegistryNotSet = 14,
    PlanterRegistryNotSet = 15,
    TreeMintingFailed = 16,
    // ── #1021 — sponsor insurance guarantee ────────────────────────────────
    InsuranceNotActive = 17,
    InsurancePeriodExpired = 18,
    TreeNotDead = 19,
    Unauthorized = 20,
    InsuranceAlreadyPurchased = 21,
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
    pub has_insurance: bool,
    pub insurance_fee: i128,
}

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    /// Initialize with an admin address, verifier address, and admin-controls address.
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

    // ── Sponsor flow ───────────────────────────────────────────────────────

    /// Sponsor deposits funds for a specific tree_id into escrow without insurance.
    /// Lock tokens against a tree identifier.
    pub fn deposit(
        env: Env,
        sponsor: Address,
        planter: Address,
        tree_id: u64,
        token: Address,
        amount: i128,
    ) {
        Self::deposit_internal(env, sponsor, planter, tree_id, token, amount, false);
    }

    /// Sponsor deposits funds for a tree with optional 1-year survival insurance (+2% fee).
    /// If the tree dies within 1 year, the sponsor gets a full refund of their deposit.
    pub fn deposit_with_insurance(
        env: Env,
        sponsor: Address,
        planter: Address,
        tree_id: u64,
        token: Address,
        amount: i128,
    ) {
        Self::deposit_internal(env, sponsor, planter, tree_id, token, amount, true);
    }

    fn deposit_internal(
        env: Env,
        sponsor: Address,
        planter: Address,
        tree_id: u64,
        token: Address,
        amount: i128,
        with_insurance: bool,
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

        let mut insurance_fee = 0i128;
        let mut total_transfer = amount;

        if with_insurance {
            insurance_fee = amount
                .checked_mul(INSURANCE_FEE_BPS as i128)
                .expect("insurance fee calculation overflow")
                .checked_div(BPS_DENOM)
                .expect("insurance fee division error");
            total_transfer = amount
                .checked_add(insurance_fee)
                .expect("total deposit calculation overflow");
        }

        token::Client::new(&env, &token).transfer(
            &sponsor,
            &env.current_contract_address(),
            &total_transfer,
        );

        let now = env.ledger().timestamp();
        env.storage().persistent().set(
            &key,
            &EscrowRecord {
                sponsor: Some(sponsor.clone()),
                planter,
                token: token.clone(),
                amount,
                deposit_time: now,
                status: EscrowStatus::Pending,
                species: None,
                region: None,
                is_anonymous: false,
                has_insurance: with_insurance,
                insurance_fee,
            },
        );

        env.events().publish(
            (symbol_short!("FundsDep"), tree_id),
            (sponsor.clone(), token, amount),
        );

        if with_insurance {
            env.events().publish(
                (symbol_short!("Insured"), tree_id),
                (sponsor, insurance_fee, now + ONE_YEAR_SECS),
            );
        }
    }

    /// Sponsor purchases insurance on an existing pending escrow (+2% fee).
    pub fn purchase_insurance(env: Env, sponsor: Address, tree_id: u64) {
        Self::assert_not_paused(&env);
        sponsor.require_auth();

        let key = Self::escrow_key(&env, tree_id);
        let mut record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, EscrowError::EscrowNotFound));

        if record.status != EscrowStatus::Pending {
            panic_with_error!(&env, EscrowError::EscrowAlreadySettled);
        }

        if record.sponsor != Some(sponsor.clone()) {
            panic_with_error!(&env, EscrowError::Unauthorized);
        }

        if record.has_insurance {
            panic_with_error!(&env, EscrowError::InsuranceAlreadyPurchased);
        }

        let insurance_fee = record
            .amount
            .checked_mul(INSURANCE_FEE_BPS as i128)
            .expect("insurance fee calculation overflow")
            .checked_div(BPS_DENOM)
            .expect("insurance fee division error");

        token::Client::new(&env, &record.token).transfer(
            &sponsor,
            &env.current_contract_address(),
            &insurance_fee,
        );

        record.has_insurance = true;
        record.insurance_fee = insurance_fee;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("Insured"), tree_id),
            (sponsor, insurance_fee, record.deposit_time + ONE_YEAR_SECS),
        );
    }

    /// Report that an insured tree has died within 1 year, triggering a full refund to the sponsor.
    /// Callable by the authorized verifier or admin.
    pub fn report_tree_dead(env: Env, tree_id: u64) {
        Self::assert_not_paused(&env);
        Self::require_verifier(&env);

        let key = Self::escrow_key(&env, tree_id);
        let mut record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, EscrowError::EscrowNotFound));

        if record.status == EscrowStatus::Refunded {
            panic_with_error!(&env, EscrowError::EscrowAlreadySettled);
        }

        if !record.has_insurance {
            panic_with_error!(&env, EscrowError::InsuranceNotActive);
        }

        let elapsed = env.ledger().timestamp().saturating_sub(record.deposit_time);
        if elapsed > ONE_YEAR_SECS {
            panic_with_error!(&env, EscrowError::InsurancePeriodExpired);
        }

        let sponsor = record.sponsor.clone().unwrap_or_else(|| {
            panic_with_error!(&env, EscrowError::Unauthorized);
        });

        // Full refund of deposit amount to sponsor
        token::Client::new(&env, &record.token).transfer(
            &env.current_contract_address(),
            &sponsor,
            &record.amount,
        );

        record.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("InsRefund"), tree_id),
            (sponsor.clone(), record.amount),
        );
        env.events().publish(
            (symbol_short!("FundsRef"), tree_id),
            (sponsor, record.amount),
        );
    }

    /// Sponsor claims full refund under the 1-year survival insurance guarantee if their tree has died.
    pub fn claim_insurance_refund(env: Env, tree_id: u64) {
        Self::assert_not_paused(&env);

        let key = Self::escrow_key(&env, tree_id);
        let mut record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, EscrowError::EscrowNotFound));

        if record.status == EscrowStatus::Refunded {
            panic_with_error!(&env, EscrowError::EscrowAlreadySettled);
        }

        if !record.has_insurance {
            panic_with_error!(&env, EscrowError::InsuranceNotActive);
        }

        let sponsor = record.sponsor.clone().unwrap_or_else(|| {
            panic_with_error!(&env, EscrowError::Unauthorized);
        });
        sponsor.require_auth();

        let elapsed = env.ledger().timestamp().saturating_sub(record.deposit_time);
        if elapsed > ONE_YEAR_SECS {
            panic_with_error!(&env, EscrowError::InsurancePeriodExpired);
        }

        // Verify tree is reported dead if TreeRegistry is available
        if let Some(tree_reg) = env.storage().instance().get::<_, Address>(&symbol_short!("TREE_REG")) {
            #[allow(dead_code)]
            #[contractclient(name = "TreeRegistryClient")]
            trait TreeRegistryTrait {
                fn is_tree_dead(env: Env, id: u64) -> bool;
            }
            let reg_client = TreeRegistryClient::new(&env, &tree_reg);
            if !reg_client.is_tree_dead(&tree_id) {
                panic_with_error!(&env, EscrowError::TreeNotDead);
            }
        }

        // Full refund of deposit amount to sponsor
        token::Client::new(&env, &record.token).transfer(
            &env.current_contract_address(),
            &sponsor,
            &record.amount,
        );

        record.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &record);

        env.events().publish(
            (symbol_short!("InsRefund"), tree_id),
            (sponsor.clone(), record.amount),
        );
        env.events().publish(
            (symbol_short!("FundsRef"), tree_id),
            (sponsor, record.amount),
        );
    }

    /// Query insurance status for a tree: (has_insurance, insurance_fee, expires_at, is_active)
    pub fn get_insurance_info(env: Env, tree_id: u64) -> (bool, i128, u64, bool) {
        let key = Self::escrow_key(&env, tree_id);
        if let Some(record) = env.storage().persistent().get::<_, EscrowRecord>(&key) {
            let expires_at = record.deposit_time + ONE_YEAR_SECS;
            let now = env.ledger().timestamp();
            let is_active = record.has_insurance
                && record.status != EscrowStatus::Refunded
                && now <= expires_at;
            (record.has_insurance, record.insurance_fee, expires_at, is_active)
        } else {
            (false, 0, 0, false)
        }
    }

    pub fn donate_anonymous(
        env: Env,
        donor: Address,
    /// Deposit an anonymous species donation and assign it to an available planter.
    pub fn donate_anonymous(
        env: Env,
        sponsor: Address,
        amount: i128,
        token: Address,
        species: Symbol,
        region: Symbol,
    ) -> (u64, Address) {
        donor.require_auth();
        Self::assert_not_paused(&env);
        sponsor.require_auth();
        let species_cost = Self::get_species_cost(env.clone(), species.clone());
        if amount < species_cost {
            panic_with_error!(&env, EscrowError::InsufficientDonation);
        }
        let planter = Self::assign_planter(&env, region.clone());
        token::Client::new(&env, &token).transfer(
            &donor,
            &env.current_contract_address(),
            &amount,
        );
        let tree_id = Self::mint_anonymous_tree(&env, species.clone(), region.clone(), planter.clone());
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
                has_insurance: false,
                insurance_fee: 0,
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
        let key = Self::escrow_key(&env, tree_id);
        let mut record: EscrowRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, EscrowError::EscrowNotFound));
        if record.status != EscrowStatus::Pending {
            panic_with_error!(&env, EscrowError::EscrowAlreadySettled);
        }

        let fee_bps = Self::fee_bps(&env);
        let fee = record
            .amount
            .checked_mul(fee_bps as i128)
            .expect("fee calculation overflow")
            .checked_div(BPS_DENOM)
            .expect("fee division error");

        let planter_amount = record
            .amount
            .checked_sub(fee)
            .expect("planter amount underflow");

        // Fee leg (only when fee > 0)
        let mut treasury: Option<Address> = None;
        if fee > 0 {
            treasury = Some(Self::get_treasury(env.clone()));
            token::Client::new(&env, &record.token).transfer(
                &env.current_contract_address(),
                treasury.as_ref().unwrap(),
                &fee,
            );
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

        // FundsRel tuple shape: (planter, planter_amount).
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
        if species == Symbol::new(&env, "teak") { 50_0000000i128 }
        else if species == Symbol::new(&env, "moringa") { 10_0000000i128 }
        else if species == Symbol::new(&env, "eucalyptus") { 35_0000000i128 }
        else if species == Symbol::new(&env, "mangrove") { 25_0000000i128 }
        else if species == Symbol::new(&env, "acacia") { 15_0000000i128 }
        else if species == Symbol::new(&env, "bamboo") { 8_0000000i128 }
        else { panic_with_error!(&env, EscrowError::InvalidSpecies); }
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
        let _: () = env.invoke_contract(
            &planter_registry,
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
        let _: () = env.invoke_contract(
            &planter_registry,
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
            .unwrap_or(0u32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        token, Address, Env, Symbol,
    };

    fn setup() -> (
        Env,
        Address,
        Address,
        Address,
        Address,
        Address,
        EscrowClient<'static>,
    ) {
        setup_with_fee(0u32)
    }

    fn setup_with_fee(fee_bps: u32) -> (
        Env,
        Address,
        Address,
        Address,
        Address,
        Address,
        EscrowClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, Escrow);
        let client = EscrowClient::new(&env, &contract_id);

        let admin_controls_id = env.register_contract(None, admin_controls::AdminControls);
        let admin_controls_client =
            admin_controls::AdminControlsClient::new(&env, &admin_controls_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        admin_controls_client.initialize(&admin, &oracle);

        let verifier = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
        token::StellarAssetClient::new(&env, &token).mint(&sponsor, &1_000_000);

        let treasury = Address::generate(&env);

        client.initialize(&admin, &verifier, &admin_controls_id);
        client.set_treasury(&treasury);
        client.set_fee_bps(&fee_bps);

        (env, admin, verifier, sponsor, planter, token, client)
    }

    fn setup_with_registries() -> (
        Env,
        Address,
        Address,
        Address,
        Address,
        Address,
        Address,
        EscrowClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, Escrow);
        let client = EscrowClient::new(&env, &contract_id);

        let admin_controls_id = env.register_contract(None, admin_controls::AdminControls);
        let admin_controls_client =
            admin_controls::AdminControlsClient::new(&env, &admin_controls_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        admin_controls_client.initialize(&admin, &oracle);

        let verifier = Address::generate(&env);
        let sponsor = Address::generate(&env);
        let planter = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let tree_registry = Address::generate(&env);
        let planter_registry = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
        token::StellarAssetClient::new(&env, &token).mint(&sponsor, &1_000_000_000);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &verifier, &admin_controls_id);
        client.set_treasury(&treasury);
        client.initialize_registries(&tree_registry, &planter_registry);
        (env, admin, verifier, sponsor, planter, token, tree_registry, client)
    }

    #[test]
    fn test_deposit_stores_record() {
        let (_env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        let rec = client.get_escrow(&1u64).unwrap();
        assert_eq!(rec.amount, 10_000);
        assert_eq!(rec.sponsor, Some(sponsor));
        assert_eq!(rec.planter, planter);
        assert_eq!(rec.token, token);
        assert_eq!(rec.status, EscrowStatus::Pending);
        assert!(!rec.is_anonymous);
        assert!(!rec.has_insurance);
        assert_eq!(rec.insurance_fee, 0);
    }

    #[test]
    fn test_deposit_with_insurance_charges_2_percent() {
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup();

        let sponsor_before = token::Client::new(&env, &token).balance(&sponsor);
        // 10_000 amount + 2% (200) fee = 10_200 total transferred
        client.deposit_with_insurance(&sponsor, &planter, &1u64, &token, &10_000);
        let sponsor_after = token::Client::new(&env, &token).balance(&sponsor);
        assert_eq!(sponsor_before - sponsor_after, 10_200);

        let rec = client.get_escrow(&1u64).unwrap();
        assert_eq!(rec.amount, 10_000);
        assert!(rec.has_insurance);
        assert_eq!(rec.insurance_fee, 200);

        let (insured, fee, expires_at, active) = client.get_insurance_info(&1u64);
        assert!(insured);
        assert_eq!(fee, 200);
        assert_eq!(expires_at, rec.deposit_time + ONE_YEAR_SECS);
        assert!(active);
    }

    #[test]
    fn test_purchase_insurance_on_existing_deposit() {
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        let rec_before = client.get_escrow(&1u64).unwrap();
        assert!(!rec_before.has_insurance);

        let sponsor_before = token::Client::new(&env, &token).balance(&sponsor);
        client.purchase_insurance(&sponsor, &1u64);
        let sponsor_after = token::Client::new(&env, &token).balance(&sponsor);
        assert_eq!(sponsor_before - sponsor_after, 200);

        let rec_after = client.get_escrow(&1u64).unwrap();
        assert!(rec_after.has_insurance);
        assert_eq!(rec_after.insurance_fee, 200);
    }

    #[test]
    fn test_report_tree_dead_refunds_insured_sponsor_full_amount() {
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit_with_insurance(&sponsor, &planter, &1u64, &token, &10_000);
        let sponsor_before = token::Client::new(&env, &token).balance(&sponsor);

        // Advance 30 days (well within 1 year guarantee)
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);

        // Verifier reports tree died
        client.report_tree_dead(&1u64);

        let sponsor_after = token::Client::new(&env, &token).balance(&sponsor);
        // Sponsor receives full refund of deposit amount (10,000)
        assert_eq!(sponsor_after - sponsor_before, 10_000);

        let rec = client.get_escrow(&1u64).unwrap();
        assert_eq!(rec.status, EscrowStatus::Refunded);

        let (_, _, _, active) = client.get_insurance_info(&1u64);
        assert!(!active, "insurance no longer active after refund");
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #18)")]
    fn test_insurance_claim_after_1_year_expired_panics() {
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit_with_insurance(&sponsor, &planter, &1u64, &token, &10_000);

        // Advance past 1 year (366 days)
        env.ledger().with_mut(|l| l.timestamp += ONE_YEAR_SECS + 86400);

        client.report_tree_dead(&1u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #17)")]
    fn test_report_tree_dead_uninsured_panics() {
        let (_env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        client.report_tree_dead(&1u64);
    }

    #[test]
    fn test_sponsor_claim_insurance_refund_success() {
        let (env, _admin, _verifier, sponsor, planter, token, tree_reg, client) = setup_with_registries();
        env.register_contract(&tree_reg, MockTreeRegistry);
        MockTreeRegistryClient::new(&env, &tree_reg).set_dead(&true);

        client.deposit_with_insurance(&sponsor, &planter, &1u64, &token, &10_000);
        let sponsor_before = token::Client::new(&env, &token).balance(&sponsor);

        // Tree is reported dead in registry, sponsor claims refund within 1 year
        env.ledger().with_mut(|l| l.timestamp += 50 * 24 * 60 * 60);

        client.claim_insurance_refund(&1u64);
        let sponsor_after = token::Client::new(&env, &token).balance(&sponsor);
        assert_eq!(sponsor_after - sponsor_before, 10_000);

        let rec = client.get_escrow(&1u64).unwrap();
        assert_eq!(rec.status, EscrowStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #19)")]
    fn test_sponsor_claim_insurance_refund_tree_alive_fails() {
        let (env, _admin, _verifier, sponsor, planter, token, tree_reg, client) = setup_with_registries();
        env.register_contract(&tree_reg, MockTreeRegistry);
        MockTreeRegistryClient::new(&env, &tree_reg).set_dead(&false);

        client.deposit_with_insurance(&sponsor, &planter, &1u64, &token, &10_000);
        client.claim_insurance_refund(&1u64);
    }

    #[contract]
    pub struct MockTreeRegistry;
    #[contractimpl]
    impl MockTreeRegistry {
        pub fn set_dead(env: Env, dead: bool) {
            env.storage().instance().set(&symbol_short!("DEAD"), &dead);
        }
        pub fn is_tree_dead(env: Env, _id: u64) -> bool {
            env.storage().instance().get(&symbol_short!("DEAD")).unwrap_or(false)
        }
    }

    #[test]
    fn test_release_transfers_to_planter() {
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        let before = token::Client::new(&env, &token).balance(&planter);
        client.release(&1u64);
        let after = token::Client::new(&env, &token).balance(&planter);
        assert_eq!(after - before, 10_000);
        let rec = client.get_escrow(&1u64).unwrap();
        assert_eq!(rec.status, EscrowStatus::Released);
    }

    #[test]
    fn test_refund_after_90_days_returns_to_sponsor() {
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        env.ledger().with_mut(|l| l.timestamp += REFUND_WINDOW + 1);
        let before = token::Client::new(&env, &token).balance(&sponsor);
        client.refund(&1u64);
        let after = token::Client::new(&env, &token).balance(&sponsor);
        assert_eq!(after - before, 10_000);
        let rec = client.get_escrow(&1u64).unwrap();
        assert_eq!(rec.status, EscrowStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_refund_before_90_days_panics() {
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        env.ledger().with_mut(|l| l.timestamp += REFUND_WINDOW - 1);
        client.refund(&1u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_double_deposit_rejected() {
        let (_env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        client.deposit(&sponsor, &planter, &1u64, &token, &5_000);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_release_twice_panics() {
        let (_env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        client.release(&1u64);
        client.release(&1u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_refund_after_release_panics() {
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);
        client.release(&1u64);
        env.ledger().with_mut(|l| l.timestamp += REFUND_WINDOW + 1);
        client.refund(&1u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_release_nonexistent_panics() {
        let (_env, _admin, _verifier, _sponsor, _planter, _token, client) = setup();

        client.release(&999u64);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_zero_amount_rejected() {
        let (_env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &0);
    }

    #[test]
    fn test_different_tree_ids_are_independent() {
        let (_env, _admin, _verifier, sponsor, planter, token, client) = setup();

        client.deposit(&sponsor, &planter, &1u64, &token, &1_000);
        client.deposit(&sponsor, &planter, &2u64, &token, &2_000);
        client.release(&1u64);
        let rec1 = client.get_escrow(&1u64).unwrap();
        let rec2 = client.get_escrow(&2u64).unwrap();
        assert_eq!(rec1.status, EscrowStatus::Released);
        assert_eq!(rec2.status, EscrowStatus::Pending);
    }

    #[test]
    fn test_release_deducts_platform_fee_default() {
        // 2% (200 bps): planter receives 98%, treasury receives 2%.
        let (env, _admin, _verifier, sponsor, planter, token, client) = setup_with_fee(200);

        client.deposit(&sponsor, &planter, &1u64, &token, &10_000);

        let treasury = client.get_treasury();
        let planter_before = token::Client::new(&env, &token).balance(&planter);
        let treasury_before = token::Client::new(&env, &token).balance(&treasury);

        client.release(&1u64);

        let rec = client.get_escrow(&1u64).unwrap();
        assert_eq!(rec.status, EscrowStatus::Released);
        assert_eq!(rec.amount, 10_000, "gross amount unchanged in record");
        assert_eq!(
            token::Client::new(&env, &token).balance(&planter) - planter_before,
            9_800,
            "planter receives 98% (10_000 - 200 bps of 10_000)"
        );
        assert_eq!(
            token::Client::new(&env, &token).balance(&treasury) - treasury_before,
            200,
            "treasury receives the 2% fee"
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_set_fee_bps_above_max_rejected() {
        let (_env, _admin, _verifier, _sponsor, _planter, _token, client) = setup();
        client.set_fee_bps(&10_001u32);
    }

    #[test]
    fn test_species_costs() {
        let (env, _admin, _verifier, _sponsor, _planter, _token, client) = setup();
        assert_eq!(client.get_species_cost(&Symbol::new(&env, "teak")), 50_0000000i128);
        assert_eq!(client.get_species_cost(&Symbol::new(&env, "moringa")), 10_0000000i128);
        assert_eq!(client.get_species_cost(&Symbol::new(&env, "eucalyptus")), 35_0000000i128);
        assert_eq!(client.get_species_cost(&Symbol::new(&env, "mangrove")), 25_0000000i128);
        assert_eq!(client.get_species_cost(&Symbol::new(&env, "acacia")), 15_0000000i128);
        assert_eq!(client.get_species_cost(&Symbol::new(&env, "bamboo")), 8_0000000i128);
    }

    #[test]
    fn test_set_fee_bps_updates_fee() {
        let (_env, _admin, _verifier, _sponsor, _planter, _token, client) = setup();

        assert_eq!(client.get_fee_bps(), 0);
        client.set_fee_bps(&500u32);
        assert_eq!(client.get_fee_bps(), 500);
        client.set_fee_bps(&0u32);
        client.set_fee_bps(&DEFAULT_FEE_BPS);
        assert_eq!(client.get_fee_bps(), DEFAULT_FEE_BPS);
    }

    #[test]
    fn test_set_treasury_updates_address() {
        let (env, _admin, _verifier, _sponsor, _planter, _token, client) = setup();
        let new_treasury_a = Address::generate(&env);
        let new_treasury_b = Address::generate(&env);

        client.set_treasury(&new_treasury_a);
        assert_eq!(client.get_treasury(), new_treasury_a);

        client.set_treasury(&new_treasury_b);
        assert_eq!(client.get_treasury(), new_treasury_b);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let (_env, admin, verifier, _sponsor, _planter, _token, client) = setup();
        let admin_controls_id = _env.register_contract(None, admin_controls::AdminControls);
        client.initialize(&admin, &verifier, &admin_controls_id);
    }

    #[cfg(test)]
    mod fuzz_tests {
        use proptest::prelude::*;

        proptest! {
            #[test]
            fn fuzz_escrow_fee_calculation_invariants(
                deposit_amount in 1i128..1_000_000_000_000i128,
                fee_bps in 0u32..10_000u32,
            ) {
                let fee = (deposit_amount as u128 * fee_bps as u128 / 10_000) as i128;
                let planter_payout = deposit_amount - fee;

                prop_assert_eq!(planter_payout + fee, deposit_amount);
                prop_assert!(fee >= 0);
                prop_assert!(planter_payout >= 0);
                prop_assert!(fee <= deposit_amount);
                prop_assert!(planter_payout <= deposit_amount);
            }

            #[test]
            fn fuzz_insurance_fee_calculation_invariants(
                deposit_amount in 1i128..1_000_000_000_000i128,
            ) {
                let fee = (deposit_amount as u128 * 200 / 10_000) as i128;
                let total = deposit_amount + fee;

                prop_assert!(fee >= 0);
                prop_assert!(total >= deposit_amount);
                prop_assert_eq!(total - fee, deposit_amount);
            }

            #[test]
            fn fuzz_escrow_refund_window_math(
                deposit_time in 0u64..1_000_000_000u64,
                elapsed_seconds in 0u64..10_000_000u64,
            ) {
                let current_time = deposit_time.saturating_add(elapsed_seconds);
                let refund_window = 90 * 24 * 60 * 60; // 90 days in seconds
                let is_eligible = current_time >= deposit_time + refund_window;

                if elapsed_seconds >= refund_window {
                    prop_assert!(is_eligible);
                } else {
                    prop_assert!(!is_eligible);
                }
            }
        }
    }
}
            .unwrap_or(0)
    }
}
