#![no_std]

//! Sponsor NFT Receipt — Closes #471
//!
//! A non-transferable (soulbound) NFT-style receipt minted to a sponsor's
//! wallet as on-chain proof of each tree they have sponsored.
//!
//! # Purpose
//!
//! When a sponsor contributes to a sponsored tree, the application calls
//! `mint_receipt` on this contract. A unique, incrementing `receipt_id` is
//! allocated and the resulting `SponsorReceipt` is permanently bound to the
//! sponsor's Stellar address together with the receipt's metadata:
//!
//! * `tree_id`     — links to the tree in the existing TreeRegistry /
//!                   tree-escrow `register_tree` namespace.
//! * `species`     — a `Symbol` matching the `species-registry` slug
//!                   (e.g. `Symbol::new(&env, "teak")`).
//! * `region`      — human-readable location (e.g. `"Lagos, Nigeria"`).
//! * `minted_at`   — ledger timestamp of the mint.
//! * `co2_estimate_scaled` — projected CO₂ sequestration in kg, scaled ×100
//!                   to match the convention used by `species-registry`.
//! * `planter`     — optional planter wallet if known at mint time.
//!
//! # Soulbound semantics
//!
//! The contract **deliberately does not expose any `transfer`, `approve`, or
//! `set_owner` function**. Once a receipt is minted, the `sponsor` field is
//! immutable for the lifetime of the ledger entry. As defence in depth, the
//! explicit `attempt_transfer` function is provided and always panics with
//! `SoulboundTransferBlocked`. This gives off-chain tooling and integration
//! tests a stable, machine-readable error code instead of the host's
//! generic "function not found" failure.
//!
//! # Storage layout
//!
//!   Instance (configuration + counters):
//!     DataKey::Admin             — Address (mint authority closest analogue)
//!     DataKey::PendingAdmin      — OptAddress
//!     DataKey::NextId            — u64   (next receipt id, monotonic)
//!     DataKey::Paused            — bool
//!
//!   Persistent (immutable user data):
//!     DataKey::Receipt(id)             — SponsorReceipt
//!     DataKey::SponsorCount(sponsor)   — u32
//!     DataKey::SponsorAt(sponsor, idx) — u64 (receipt_id at sponsor index `idx`)
//!     DataKey::SponsorTree(sponsor, tree_id) — u64 (dedup boundary)

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short,
    Address, Env, String, Symbol, Vec,
};

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotPendingAdmin = 3,
    AlreadyPaused = 4,
    NotPaused = 5,
    ContractPaused = 6,
    /// A receipt already exists for this (sponsor, tree_id).
    AlreadyMintedReceipt = 7,
    ReceiptNotFound = 8,
    NotAuthorized = 9,
    /// Burned-in defence: a transfer was attempted on a soulbound receipt.
    SoulboundTransferBlocked = 10,
    InvalidCo2Estimate = 11,
    InvalidTreeId = 12,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// Option<Address> wrapper — mirrors `admin-controls`'s pattern because
/// Soroban's `#[contracttype]` does not directly support `Option<Address>`.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OptAddress {
    None,
    Some(Address),
}

impl OptAddress {
    pub fn is_none(&self) -> bool {
        matches!(self, OptAddress::None)
    }
}

/// On-chain soulbound NFT receipt for a single sponsor × tree pair.
#[contracttype]
#[derive(Clone, Debug)]
pub struct SponsorReceipt {
    /// Globally unique incrementing receipt id.
    pub receipt_id: u64,
    /// Sponsor wallet the receipt is bound to (immutable).
    pub sponsor: Address,
    /// Linked tree_id in the tree-escrow / tree-registry namespace.
    pub tree_id: u64,
    /// Species slug matching `species-registry` namespace
    /// (e.g. `Symbol::new(&env, "teak")`).
    pub species: Symbol,
    /// Human-readable region (e.g. `"Lagos, Nigeria"`).
    pub region: String,
    /// Ledger timestamp at mint.
    pub minted_at: u64,
    /// Projected CO₂ in kg, scaled ×100 to match the species-registry
    /// `co2_scaled` convention (e.g. 22.00 kg/yr → 2200).
    pub co2_estimate_scaled: i128,
    /// Optional planter address if known at mint time.
    pub planter: OptAddress,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub enum DataKey {
    /// Admin address (instance).
    Admin,
    /// Pending admin during two-step transfer (instance).
    PendingAdmin,
    /// Monotonic next receipt id (instance).
    NextId,
    /// Pause flag (instance).
    Paused,
    /// Primary receipt store, keyed by receipt_id (persistent).
    Receipt(u64),
    /// Number of receipts owned by a sponsor (instance).
    SponsorCount(Address),
    /// Receipt id at a sponsor's sequential index (instance).
    SponsorAt(Address, u32),
    /// Dedup boundary: (sponsor, tree_id) → receipt_id (persistent).
    SponsorTree(Address, u64),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct SponsorReceiptContract;

#[contractimpl]
impl SponsorReceiptContract {
    // ── Initialisation ────────────────────────────────────────────────────────

    /// One-time initialisation.
    ///
    /// `admin` — multi-sig admin authorised to pause/unpause and to perform
    /// emergency revocation of a receipt. The sponsor themselves is the
    /// canonical authority for `mint_receipt` (see below).
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextId, &0u64);
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    // ── Mint ──────────────────────────────────────────────────────────────────

    /// Mint a non-transferable receipt to `sponsor` for `tree_id`. Returns the
    /// newly allocated receipt id.
    ///
    /// Authentication: the **sponsor** must sign the transaction
    /// (`sponsor.require_auth()`). The sponsor is the canonical authority
    /// over their own receipts; off-chain meta-transaction infrastructure
    /// can let backend relayers pay fees while the sponsor still signs.
    pub fn mint_receipt(
        env: Env,
        sponsor: Address,
        tree_id: u64,
        species: Symbol,
        region: String,
        co2_estimate_scaled: i128,
        planter: OptAddress,
    ) -> u64 {
        Self::assert_not_paused(&env);
        sponsor.require_auth();

        // Validate inputs.
        if tree_id == 0 {
            panic_with_error!(&env, Error::InvalidTreeId);
        }
        if co2_estimate_scaled <= 0 {
            panic_with_error!(&env, Error::InvalidCo2Estimate);
        }

        // Dedup: only one receipt per (sponsor, tree_id).
        let dedup_key = DataKey::SponsorTree(sponsor.clone(), tree_id);
        if env.storage().persistent().has(&dedup_key) {
            panic_with_error!(&env, Error::AlreadyMintedReceipt);
        }

        // Allocate next receipt id.
        let next: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(0);
        let receipt_id = next.checked_add(1).expect("receipt id overflow");
        env.storage()
            .instance()
            .set(&DataKey::NextId, &receipt_id);

        let receipt = SponsorReceipt {
            receipt_id,
            sponsor: sponsor.clone(),
            tree_id,
            species,
            region,
            minted_at: env.ledger().timestamp(),
            co2_estimate_scaled,
            planter,
        };

        // Persist primary record.
        env.storage()
            .persistent()
            .set(&DataKey::Receipt(receipt_id), &receipt);

        // Index the receipt id under the sponsor.
        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::SponsorCount(sponsor.clone()))
            .unwrap_or(0);
        env.storage().instance().set(
            &DataKey::SponsorAt(sponsor.clone(), count),
            &receipt_id,
        );
        env.storage().instance().set(
            &DataKey::SponsorCount(sponsor.clone()),
            &count.checked_add(1).expect("sponsor receipt count overflow"),
        );

        // Mark (sponsor, tree_id) → receipt_id for fast dedup lookups.
        env.storage()
            .persistent()
            .set(&dedup_key, &receipt_id);

        env.events()
            .publish((symbol_short!("RecvMint"), sponsor), receipt_id);

        receipt_id
    }

    // ── Reads ─────────────────────────────────────────────────────────────────

    /// Look up a single receipt by id. Returns `None` when not found.
    pub fn get_receipt(env: Env, receipt_id: u64) -> Option<SponsorReceipt> {
        env.storage()
            .persistent()
            .get(&DataKey::Receipt(receipt_id))
    }

    /// Return all receipt ids owned by `sponsor` in mint insertion order.
    pub fn get_receipts_by_sponsor(env: Env, sponsor: Address) -> Vec<u64> {
        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::SponsorCount(sponsor.clone()))
            .unwrap_or(0);
        let mut out: Vec<u64> = Vec::new(&env);
        for i in 0..count {
            if let Some(id) = env
                .storage()
                .instance()
                .get::<_, u64>(&DataKey::SponsorAt(sponsor.clone(), i))
            {
                out.push_back(id);
            }
        }
        out
    }

    /// Resolve the receipt id for a (sponsor, tree_id) pair. Returns `0` when
    /// no receipt has been minted for that pair (the storage layer treats `0`
    /// as the canonical sentinel and id allocation starts at `1`).
    pub fn receipt_for_tree(env: Env, sponsor: Address, tree_id: u64) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::SponsorTree(sponsor, tree_id))
            .unwrap_or(0u64)
    }

    /// Returns the total addressable receipt-id space — equal to the next id
    /// that will be allocated on the next mint.
    pub fn total_receipts(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(0)
    }

    // ── Soulbound enforcement ─────────────────────────────────────────────────

    /// Always-panicking transfer guard. The contract exposes NO working
    /// transfer function — receipts are soulbound by construction — but this
    /// explicit function gives a stable, machine-readable error code
    /// (`SoulboundTransferBlocked`) to any caller (off-chain tooling,
    /// bridge, integration test) that mistakenly tries to transfer a
    /// receipt.
    pub fn attempt_transfer(
        env: Env,
        _from: Address,
        _to: Address,
        _receipt_id: u64,
    ) {
        panic_with_error!(&env, Error::SoulboundTransferBlocked);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// Admin-only emergency revocation. Removes the receipt from the
    /// sponsor's index using a swap-with-last strategy (so the remaining
    /// receipts stay contiguous at indices `0..count-1`) and clears the
    /// `(sponsor, tree_id)` dedup boundary so a future mint may replace a
    /// clerically-issued disputed receipt. The primary
    /// `DataKey::Receipt(id)` record is intentionally **not** deleted so the
    /// historical record remains queryable via `get_receipt`.
    pub fn revoke_receipt(env: Env, receipt_id: u64) {
        Self::require_admin(&env);
        Self::assert_not_paused(&env);

        let receipt: SponsorReceipt = env
            .storage()
            .persistent()
            .get(&DataKey::Receipt(receipt_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::ReceiptNotFound));

        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::SponsorCount(receipt.sponsor.clone()))
            .unwrap_or(0);

        // Locate the slot of the revoked receipt within the sponsor's index.
        // The slot is guaranteed to exist: mint_receipt pushes into slot
        // `count-1` and `get_receipts_by_sponsor` was called at least once.
        let mut revoke_idx: u32 = count;
        for i in 0..count {
            if let Some(id) = env
                .storage()
                .instance()
                .get::<_, u64>(&DataKey::SponsorAt(receipt.sponsor.clone(), i))
            {
                if id == receipt_id {
                    revoke_idx = i;
                    break;
                }
            }
        }

        if revoke_idx < count {
            let last_idx = count - 1;
            if revoke_idx != last_idx {
                // Swap-with-last: copy the last slot's id into the revoked
                // slot so the remaining ids stay packed at `0..last_idx`.
                let last_id: u64 = env
                    .storage()
                    .instance()
                    .get(&DataKey::SponsorAt(receipt.sponsor.clone(), last_idx))
                    .expect("last sponsor-at slot missing");
                env.storage()
                    .instance()
                    .set(&DataKey::SponsorAt(receipt.sponsor.clone(), revoke_idx), &last_id);
            }
            env.storage()
                .instance()
                .remove(&DataKey::SponsorAt(receipt.sponsor.clone(), last_idx));
            env.storage()
                .instance()
                .set(&DataKey::SponsorCount(receipt.sponsor.clone()), &last_idx);
        }

        // Clear the dedup boundary so a fresh receipt may be issued later.
        env.storage().persistent().remove(&DataKey::SponsorTree(
            receipt.sponsor.clone(),
            receipt.tree_id,
        ));

        env.events().publish(
            (symbol_short!("RecvRev"), receipt.sponsor),
            receipt_id,
        );
    }

    // ── Pause ─────────────────────────────────────────────────────────────────

    pub fn pause(env: Env) {
        Self::require_admin(&env);
        if Self::_is_paused(&env) {
            panic_with_error!(&env, Error::AlreadyPaused);
        }
        env.storage().instance().set(&DataKey::Paused, &true);
        env.events()
            .publish((symbol_short!("Paused"),), env.ledger().timestamp());
    }

    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        if !Self::_is_paused(&env) {
            panic_with_error!(&env, Error::NotPaused);
        }
        env.storage().instance().set(&DataKey::Paused, &false);
        env.events()
            .publish((symbol_short!("Unpaused"),), env.ledger().timestamp());
    }

    pub fn is_paused(env: Env) -> bool {
        Self::_is_paused(&env)
    }

    // ── Admin rotation (two-step) ─────────────────────────────────────────────

    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized))
    }

    /// Step 1: current admin proposes a new admin.
    pub fn propose_admin(env: Env, new_admin: Address) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &OptAddress::Some(new_admin.clone()));
        env.events().publish((symbol_short!("AdminProp"),), new_admin);
    }

    /// Step 2: the proposed admin signs and accepts the role.
    pub fn accept_admin(env: Env) {
        let pending: OptAddress = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .unwrap_or(OptAddress::None);
        let new_admin = match pending {
            OptAddress::Some(a) => a,
            OptAddress::None => panic_with_error!(&env, Error::NotPendingAdmin),
        };
        new_admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &OptAddress::None);
        env.events().publish((symbol_short!("AdminXfer"),), new_admin);
    }

    // ── internal helpers ──────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized));
        admin.require_auth();
    }

    fn assert_not_paused(env: &Env) {
        if Self::_is_paused(env) {
            panic_with_error!(env, Error::ContractPaused);
        }
    }

    fn _is_paused(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger as _}, vec, Address, Env, String, Symbol};

    fn setup() -> (
        Env,
        Address,
        Address,
        SponsorReceiptContractClient<'static>,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SponsorReceiptContract);
        let client = SponsorReceiptContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let sponsor = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, sponsor, client)
    }

    fn species_teak(env: &Env) -> Symbol {
        Symbol::new(env, "teak")
    }

    fn species_bamboo(env: &Env) -> Symbol {
        Symbol::new(env, "bamboo")
    }

    fn region_lagos(env: &Env) -> String {
        String::from_str(env, "Lagos, Nigeria")
    }

    fn region_nairobi(env: &Env) -> String {
        String::from_str(env, "Nairobi, Kenya")
    }

    fn planter(env: &Env) -> OptAddress {
        OptAddress::Some(Address::generate(env))
    }

    // ── initialise ────────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_passes() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SponsorReceiptContract);
        let client = SponsorReceiptContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        assert_eq!(client.get_admin(), admin);
        assert_eq!(client.total_receipts(), 0);
        assert!(!client.is_paused());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let (env, admin, _, client) = setup();
        let _ = admin; // silence unused-warning
        client.initialize(&Address::generate(&env));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_get_admin_before_initialize_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, SponsorReceiptContract);
        let client = SponsorReceiptContractClient::new(&env, &contract_id);
        let _ = client.get_admin();
    }

    // ── mint_receipt ──────────────────────────────────────────────────────────

    #[test]
    fn test_mint_receipt_basic() {
        let (env, _admin, sponsor, client) = setup();
        env.ledger().with_mut(|l| l.timestamp = 1_000_000);

        let id = client.mint_receipt(
            &sponsor,
            &42,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &planter(&env),
        );

        assert_eq!(id, 1);
        assert_eq!(client.total_receipts(), 1);

        let receipt = client.get_receipt(&id).unwrap();
        assert_eq!(receipt.receipt_id, 1);
        assert_eq!(receipt.sponsor, sponsor);
        assert_eq!(receipt.tree_id, 42);
        assert_eq!(receipt.species, species_teak(&env));
        assert_eq!(receipt.region, region_lagos(&env));
        assert_eq!(receipt.co2_estimate_scaled, 2200);
        assert!(!receipt.planter.is_none());
        assert!(receipt.minted_at > 0);
    }

    #[test]
    fn test_mint_receipt_with_no_planter() {
        let (env, _admin, sponsor, client) = setup();
        let id = client.mint_receipt(
            &sponsor,
            &7,
            &species_bamboo(&env),
            &region_nairobi(&env),
            &3500_i128,
            &OptAddress::None,
        );
        assert_eq!(id, 1);
        let r = client.get_receipt(&id).unwrap();
        assert!(r.planter.is_none());
    }

    #[test]
    fn test_receipt_ids_are_monotonic_across_sponsors() {
        let (env, _admin, sponsor_a, client) = setup();
        let sponsor_b = Address::generate(&env);

        let id_a1 = client.mint_receipt(
            &sponsor_a,
            &1,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
        let id_b1 = client.mint_receipt(
            &sponsor_b,
            &1,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
        let id_a2 = client.mint_receipt(
            &sponsor_a,
            &2,
            &species_bamboo(&env),
            &region_nairobi(&env),
            &3500_i128,
            &OptAddress::None,
        );

        assert_eq!(id_a1, 1);
        assert_eq!(id_b1, 2);
        assert_eq!(id_a2, 3);
        assert_eq!(client.total_receipts(), 3);
    }

    #[test]
    fn test_get_receipts_by_sponsor_returns_insertion_order() {
        let (env, _admin, sponsor, client) = setup();

        let mut ids: Vec<u64> = Vec::new(&env);
        for t in 1u64..=4 {
            ids.push_back(client.mint_receipt(
                &sponsor,
                &t,
                &species_teak(&env),
                &region_lagos(&env),
                &2200_i128,
                &OptAddress::None,
            ));
        }
        assert_eq!(ids, vec![&env, 1u64, 2, 3, 4]);

        let listed = client.get_receipts_by_sponsor(&sponsor);
        assert_eq!(listed, ids);
    }

    #[test]
    fn test_get_receipts_by_sponsor_does_not_leak_across_sponsors() {
        let (env, _admin, sponsor_a, client) = setup();
        let sponsor_b = Address::generate(&env);

        client.mint_receipt(
            &sponsor_a,
            &1,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
        client.mint_receipt(
            &sponsor_b,
            &1,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );

        let a_listed = client.get_receipts_by_sponsor(&sponsor_a);
        let b_listed = client.get_receipts_by_sponsor(&sponsor_b);
        assert_eq!(a_listed.len(), 1);
        assert_eq!(b_listed.len(), 1);
        assert_ne!(a_listed.get(0).unwrap(), b_listed.get(0).unwrap());
    }

    #[test]
    fn test_get_receipts_by_sponsor_returns_empty_for_owner() {
        let (env, _admin, _sponsor, client) = setup();
        let stranger = Address::generate(&env);
        assert_eq!(client.get_receipts_by_sponsor(&stranger).len(), 0);
    }

    #[test]
    fn test_receipt_for_tree_round_trip() {
        let (env, _admin, sponsor, client) = setup();
        let id = client.mint_receipt(
            &sponsor,
            &99,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
        assert_eq!(client.receipt_for_tree(&sponsor, &99), id);
        assert_eq!(client.receipt_for_tree(&sponsor, &100), 0);
        assert_eq!(
            client.receipt_for_tree(&Address::generate(&env), &99),
            0
        );
    }

    // ── dedup (sponsor × tree) ────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #7)")]
    fn test_duplicate_mint_same_sponsor_same_tree_rejected() {
        let (env, _admin, sponsor, client) = setup();
        client.mint_receipt(
            &sponsor,
            &42,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
        client.mint_receipt(
            &sponsor,
            &42,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
    }

    #[test]
    fn test_same_sponsor_different_trees_allowed() {
        let (env, _admin, sponsor, client) = setup();
        let id1 = client.mint_receipt(
            &sponsor,
            &1,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
        let id2 = client.mint_receipt(
            &sponsor,
            &2,
            &species_bamboo(&env),
            &region_nairobi(&env),
            &3500_i128,
            &OptAddress::None,
        );
        assert_ne!(id1, id2);
        assert_eq!(client.receipt_for_tree(&sponsor, &1), id1);
        assert_eq!(client.receipt_for_tree(&sponsor, &2), id2);
    }

    #[test]
    fn test_different_sponsors_same_tree_all_ok() {
        let (env, _admin, sponsor_a, client) = setup();
        let sponsor_b = Address::generate(&env);
        let sponsor_c = Address::generate(&env);

        let id_a = client.mint_receipt(
            &sponsor_a,
            &1,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
        let id_b = client.mint_receipt(
            &sponsor_b,
            &1,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
        let id_c = client.mint_receipt(
            &sponsor_c,
            &1,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
        assert_ne!(id_a, id_b);
        assert_ne!(id_a, id_c);
        assert_ne!(id_b, id_c);
    }

    // ── input validation ─────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #12)")]
    fn test_zero_tree_id_rejected() {
        let (env, _admin, sponsor, client) = setup();
        client.mint_receipt(
            &sponsor,
            &0,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_zero_co2_rejected() {
        let (env, _admin, sponsor, client) = setup();
        client.mint_receipt(
            &sponsor,
            &1,
            &species_teak(&env),
            &region_lagos(&env),
            &0_i128,
            &OptAddress::None,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #11)")]
    fn test_negative_co2_rejected() {
        let (env, _admin, sponsor, client) = setup();
        client.mint_receipt(
            &sponsor,
            &1,
            &species_teak(&env),
            &region_lagos(&env),
            &-1_i128,
            &OptAddress::None,
        );
    }

    // ── soulbound enforcement ─────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_attempt_transfer_always_panics() {
        let (env, _admin, sponsor, client) = setup();
        let id = client.mint_receipt(
            &sponsor,
            &1,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
        let recipient = Address::generate(&env);
        client.attempt_transfer(&sponsor, &recipient, &id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_attempt_transfer_panics_even_for_unknown_receipt() {
        let (env, _admin, sponsor, client) = setup();
        let stranger = Address::generate(&env);
        // Receipt id 999 was never minted — but the soulbound guard must
        // trip before any lookup logic runs.
        client.attempt_transfer(&sponsor, &stranger, &999u64);
    }

    // ── revoke ────────────────────────────────────────────────────────────────

    #[test]
    fn test_revoke_by_admin_clears_index_and_dedup() {
        let (env, admin, sponsor, client) = setup();
        let id = client.mint_receipt(
            &sponsor,
            &42,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
        assert_eq!(client.receipt_for_tree(&sponsor, &42), id);
        assert_eq!(client.get_receipts_by_sponsor(&sponsor).len(), 1);

        client.revoke_receipt(&id);

        // Sponsor index is cleared.
        assert_eq!(client.get_receipts_by_sponsor(&sponsor).len(), 0);
        // Dedup boundary is cleared — a re-mint is now permitted.
        assert_eq!(client.receipt_for_tree(&sponsor, &42), 0);
        // Historical record is still queryable (audit trail).
        let historical = client.get_receipt(&id).unwrap();
        assert_eq!(historical.receipt_id, id);
        assert_eq!(historical.sponsor, sponsor);

        // Re-mint after revoke works.
        let _ = admin; // admin already authed above via mock_all_auths
        let id2 = client.mint_receipt(
            &sponsor,
            &42,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
        assert_ne!(id2, id);
        assert_eq!(client.receipt_for_tree(&sponsor, &42), id2);
    }

    #[test]
    #[should_panic]
    fn test_revoke_by_non_admin_rejected() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SponsorReceiptContract);
        let client = SponsorReceiptContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let sponsor = Address::generate(&env);

        // initialize() does not call require_auth, so we can run it before
        // any auth mocks are set up.
        client.initialize(&admin);

        // Mock all auths so mint_receipt can succeed (sponsor.require_auth).
        // We then clear all mocks before revoke so admin.require_auth() fails.
        env.mock_all_auths();
        let id = client.mint_receipt(
            &sponsor,
            &42u64,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );

        // Now zero out every auth — revoke must panic on require_auth.
        env.mock_auths(&[]);
        client.revoke_receipt(&id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn test_revoke_unknown_receipt_panics() {
        let (_env, _admin, _sponsor, client) = setup();
        client.revoke_receipt(&999_999u64);
    }

    #[test]
    fn test_revoke_middle_receipt_keeps_remaining_contiguous() {
        // Regression test for the swap-with-last revoke logic. With three
        // receipts at sponsor-index positions 0, 1, 2 we revoke the middle
        // one (index 1) and assert that the remaining two ids survive at
        // positions 0 and 1 — contiguous, no holes.
        let (env, _admin, sponsor, client) = setup();

        let id_a = client.mint_receipt(
            &sponsor, &1u64, &species_teak(&env), &region_lagos(&env), &2200_i128, &OptAddress::None,
        );
        let id_b = client.mint_receipt(
            &sponsor, &2u64, &species_bamboo(&env), &region_nairobi(&env), &3500_i128, &OptAddress::None,
        );
        let id_c = client.mint_receipt(
            &sponsor, &3u64, &species_teak(&env), &region_lagos(&env), &2200_i128, &OptAddress::None,
        );

        client.revoke_receipt(&id_b);

        let surviving = client.get_receipts_by_sponsor(&sponsor);
        assert_eq!(surviving.len(), 2);
        assert_eq!(surviving.get(0).unwrap(), id_a);
        assert_eq!(surviving.get(1).unwrap(), id_c);
        // Revoked receipt remains queryable via get_receipt for audit.
        let historical = client.get_receipt(&id_b).unwrap();
        assert_eq!(historical.receipt_id, id_b);
        // The (sponsor, tree_id=2) dedup boundary is cleared so a re-mint
        // is allowed.
        assert_eq!(client.receipt_for_tree(&sponsor, &2u64), 0);
    }

    #[test]
    fn test_revoke_last_receipt_decrements_count() {
        // When the revoked receipt is at the last slot, swap-with-last is a
        // no-op and we just drop the trailing slot.
        let (env, _admin, sponsor, client) = setup();

        let id_a = client.mint_receipt(
            &sponsor, &1u64, &species_teak(&env), &region_lagos(&env), &2200_i128, &OptAddress::None,
        );
        let id_b = client.mint_receipt(
            &sponsor, &2u64, &species_bamboo(&env), &region_nairobi(&env), &3500_i128, &OptAddress::None,
        );

        client.revoke_receipt(&id_b);
        assert_eq!(client.get_receipts_by_sponsor(&sponsor), vec![&env, id_a]);
    }

    // ── pause ─────────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_mint_while_paused_rejected() {
        let (env, admin, sponsor, client) = setup();
        client.pause();
        let _ = admin;
        client.mint_receipt(
            &sponsor,
            &1,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn test_revoke_while_paused_rejected() {
        let (env, admin, sponsor, client) = setup();
        let id = client.mint_receipt(
            &sponsor,
            &1,
            &species_teak(&env),
            &region_lagos(&env),
            &2200_i128,
            &OptAddress::None,
        );
        client.pause();
        let _ = admin;
        client.revoke_receipt(&id);
    }

    #[test]
    fn test_pause_unpause_cycle() {
        let (_env, _admin, _sponsor, client) = setup();
        assert!(!client.is_paused());
        client.pause();
        assert!(client.is_paused());
        client.unpause();
        assert!(!client.is_paused());
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_double_pause_rejected() {
        let (_env, _admin, _sponsor, client) = setup();
        client.pause();
        client.pause();
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_unpause_when_not_paused_rejected() {
        let (_env, _admin, _sponsor, client) = setup();
        client.unpause();
    }

    // ── admin rotation ────────────────────────────────────────────────────────

    #[test]
    fn test_two_step_admin_transfer() {
        let (env, _admin, _sponsor, client) = setup();
        let new_admin = Address::generate(&env);

        client.propose_admin(&new_admin);
        client.accept_admin();
        assert_eq!(client.get_admin(), new_admin);
        let _ = env;
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_accept_admin_without_proposal_rejected() {
        let (_env, _admin, _sponsor, client) = setup();
        client.accept_admin();
    }

    // ── unknown-lookup & metadata sanity ──────────────────────────────────────

    #[test]
    fn test_get_unknown_receipt_returns_none() {
        let (_env, _admin, _sponsor, client) = setup();
        assert!(client.get_receipt(&9_999u64).is_none());
    }

    #[test]
    fn test_metadata_round_trip_for_each_field() {
        let (env, _admin, sponsor, client) = setup();
        let planter_addr = Address::generate(&env);
        let id = client.mint_receipt(
            &sponsor,
            &1234,
            &Symbol::new(&env, "mahogany"),
            &String::from_str(&env, "Côte d'Ivoire / Comoé"),
            &1875_i128,
            &OptAddress::Some(planter_addr.clone()),
        );

        let receipt = client.get_receipt(&id).unwrap();
        assert_eq!(receipt.species, Symbol::new(&env, "mahogany"));
        assert_eq!(receipt.region, String::from_str(&env, "Côte d'Ivoire / Comoé"));
        assert_eq!(receipt.co2_estimate_scaled, 1875);
        match receipt.planter {
            OptAddress::Some(p) => assert_eq!(p, planter_addr),
            OptAddress::None => panic!("expected OptAddress::Some"),
        }
    }
}
