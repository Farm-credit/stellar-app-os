#![no_std]

//! Tree Retirement — issue #1091
//!
//! Permanently retires mature trees, burning their circulating record and
//! issuing a soulbound retirement certificate to the sponsor.
//!
//! # Design
//!
//! - `initialize(admin)` — one-time setup. `admin` manages the issuer set
//!   and can pause/unpause.
//! - Admin manages an **issuer set** (verifiers/oracles attesting tree
//!   maturity) via `add_issuer` / `remove_issuer` — mirrors the pattern
//!   used in the `nft-certificate` contract for consistency.
//! - `retire_tree(issuer, sponsor, tree_id, tree_count, co2_offset_kg, reason)`
//!   — issuer-gated. Permanently marks `tree_id` as retired (idempotency
//!   checked — a given `tree_id` can only ever be retired once, enforcing
//!   "removed from circulation") and issues a `RetirementCertificate`
//!   owned by `sponsor`.
//! - Retirement is irreversible by design: there is no "un-retire" entry
//!   point anywhere in this contract.

use harvesta_errors::HarvestaError;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, String, Vec,
};

// ── Error codes ───────────────────────────────────────────────────────────────

/// Contract-specific error codes for the retirement issuer authority system.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RetirementError {
    /// Caller is not in the authorized issuer set and is not the admin.
    NotAuthorizedIssuer = 500,
    /// Address is already in the issuer set.
    IssuerAlreadyExists = 501,
    /// Address is not in the issuer set.
    IssuerNotFound = 502,
    /// Cannot remove the last issuer (would make retirement impossible).
    CannotRemoveLastIssuer = 503,
    /// `tree_id` has already been retired — retirement is permanent and
    /// cannot be repeated for the same tree.
    TreeAlreadyRetired = 504,
    /// No retirement certificate exists for the supplied ID.
    RetirementCertificateNotFound = 505,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// A permanent, soulbound record of a tree's retirement from circulation.
#[contracttype]
#[derive(Clone, Debug)]
pub struct RetirementCertificate {
    pub retirement_id: u64,
    /// The sponsor who receives this certificate — non-transferable.
    pub sponsor: Address,
    /// External identifier of the tree/certificate being retired (e.g. the
    /// `token_id` of the corresponding `nft-certificate`).
    pub tree_id: u64,
    pub tree_count: i128,
    pub co2_offset_kg: i128,
    pub reason: String,
    pub retired_at: u64,
    /// The issuer/verifier who attested maturity and triggered retirement.
    pub retired_by: Address,
}

/// Issuer record — stores address and registration timestamp.
#[contracttype]
#[derive(Clone, Debug)]
pub struct IssuerRecord {
    pub issuer: Address,
    pub added_at: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Admin,
    Paused,
    Issuers,
    RetirementSeq,
    /// Retirement certificate, keyed by retirement ID.
    Retirement(u64),
    /// Marker key: presence means `tree_id` has been permanently retired.
    /// Value is the `retirement_id` that retired it.
    RetiredTree(u64),
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct TreeRetirement;

#[contractimpl]
impl TreeRetirement {
    /// One-time initialisation.
    ///
    /// `admin` — manages the issuer set and pause state.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::RetirementSeq, &0u64);
        let empty: Vec<IssuerRecord> = Vec::new(&env);
        env.storage().instance().set(&DataKey::Issuers, &empty);
    }

    // ── Issuer management ─────────────────────────────────────────────────────

    /// Add an address to the authorized issuer set. Admin only.
    pub fn add_issuer(env: Env, issuer: Address) {
        Self::require_admin(&env);

        let mut issuers = Self::issuers(&env);
        for i in 0..issuers.len() {
            if issuers.get(i).unwrap().issuer == issuer {
                panic_with_error!(&env, RetirementError::IssuerAlreadyExists);
            }
        }
        issuers.push_back(IssuerRecord {
            issuer: issuer.clone(),
            added_at: env.ledger().timestamp(),
        });
        env.storage().instance().set(&DataKey::Issuers, &issuers);

        env.events().publish((symbol_short!("issAdd"), issuer), env.ledger().timestamp());
    }

    /// Remove an address from the authorized issuer set. Admin only.
    /// Cannot remove the last remaining issuer.
    pub fn remove_issuer(env: Env, issuer: Address) {
        Self::require_admin(&env);

        let issuers = Self::issuers(&env);
        if issuers.len() <= 1 {
            let contains = issuers.len() == 1 && issuers.get(0).unwrap().issuer == issuer;
            if contains {
                panic_with_error!(&env, RetirementError::CannotRemoveLastIssuer);
            }
        }

        let mut found = false;
        let mut updated: Vec<IssuerRecord> = Vec::new(&env);
        for i in 0..issuers.len() {
            let rec = issuers.get(i).unwrap();
            if rec.issuer == issuer {
                found = true;
            } else {
                updated.push_back(rec);
            }
        }
        if !found {
            panic_with_error!(&env, RetirementError::IssuerNotFound);
        }
        env.storage().instance().set(&DataKey::Issuers, &updated);

        env.events().publish((symbol_short!("issRm"), issuer), env.ledger().timestamp());
    }

    /// Returns all current issuer records.
    pub fn get_issuers(env: Env) -> Vec<IssuerRecord> {
        Self::issuers(&env)
    }

    /// Returns `true` if `addr` is an authorized issuer.
    pub fn is_issuer(env: Env, addr: Address) -> bool {
        Self::check_is_issuer(&env, &addr)
    }

    // ── Pause ─────────────────────────────────────────────────────────────────

    /// Admin-only pause. Blocks `retire_tree`.
    pub fn pause(env: Env) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::Paused, &true);
    }

    /// Admin-only unpause.
    pub fn unpause(env: Env) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    // ── Retirement ────────────────────────────────────────────────────────────

    /// Permanently retire a mature tree, burning it from circulation and
    /// issuing a soulbound retirement certificate to `sponsor`.
    ///
    /// `issuer` — an authorized issuer attesting the tree is mature; must sign.
    /// `sponsor` — the address that receives the retirement certificate.
    /// `tree_id` — external identifier of the tree/certificate being retired.
    /// `tree_count` / `co2_offset_kg` — carried over into the certificate.
    /// `reason` — free-text retirement reason (e.g. "matured, harvested").
    ///
    /// # Errors
    /// - `NotAuthorizedIssuer` if `issuer` is not in the issuer set.
    /// - `TreeAlreadyRetired` if `tree_id` was already retired — retirement
    ///   is permanent and can never be repeated for the same tree.
    /// - `TreeCountMustBePositive` / `Co2MustBePositive` on invalid inputs.
    pub fn retire_tree(
        env: Env,
        issuer: Address,
        sponsor: Address,
        tree_id: u64,
        tree_count: i128,
        co2_offset_kg: i128,
        reason: String,
    ) -> u64 {
        Self::assert_not_paused(&env);
        issuer.require_auth();

        if !Self::check_is_issuer(&env, &issuer) {
            panic_with_error!(&env, RetirementError::NotAuthorizedIssuer);
        }
        if tree_count <= 0 {
            panic_with_error!(&env, HarvestaError::TreeCountMustBePositive);
        }
        if co2_offset_kg <= 0 {
            panic_with_error!(&env, HarvestaError::Co2MustBePositive);
        }

        let retired_key = DataKey::RetiredTree(tree_id);
        if env.storage().persistent().has(&retired_key) {
            panic_with_error!(&env, RetirementError::TreeAlreadyRetired);
        }

        let seq: u64 = env.storage().instance().get(&DataKey::RetirementSeq).unwrap_or(0);
        let retirement_id = seq + 1;

        let cert = RetirementCertificate {
            retirement_id,
            sponsor: sponsor.clone(),
            tree_id,
            tree_count,
            co2_offset_kg,
            reason,
            retired_at: env.ledger().timestamp(),
            retired_by: issuer.clone(),
        };

        env.storage().persistent().set(&DataKey::Retirement(retirement_id), &cert);
        // Permanent burn marker — this key is never deleted, so the tree can
        // never be retired (or re-enter circulation) again.
        env.storage().persistent().set(&retired_key, &retirement_id);
        env.storage().instance().set(&DataKey::RetirementSeq, &retirement_id);

        env.events().publish(
            (symbol_short!("retired"), sponsor),
            (retirement_id, tree_id, issuer),
        );

        retirement_id
    }

    // ── Query ─────────────────────────────────────────────────────────────────

    /// Returns the retirement certificate by ID, or `None`.
    pub fn get_retirement_certificate(env: Env, retirement_id: u64) -> Option<RetirementCertificate> {
        env.storage().persistent().get(&DataKey::Retirement(retirement_id))
    }

    /// Returns `true` if `tree_id` has already been permanently retired.
    pub fn is_tree_retired(env: Env, tree_id: u64) -> bool {
        env.storage().persistent().has(&DataKey::RetiredTree(tree_id))
    }

    /// Returns the retirement certificate for `tree_id`, if it has been retired.
    pub fn get_retirement_for_tree(env: Env, tree_id: u64) -> Option<RetirementCertificate> {
        let retirement_id: Option<u64> = env.storage().persistent().get(&DataKey::RetiredTree(tree_id));
        match retirement_id {
            Some(id) => env.storage().persistent().get(&DataKey::Retirement(id)),
            None => None,
        }
    }

    /// Total number of retirements issued so far.
    pub fn retirement_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::RetirementSeq).unwrap_or(0)
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        admin.require_auth();
    }

    fn assert_not_paused(env: &Env) {
        let paused: bool = env.storage().instance().get(&DataKey::Paused).unwrap_or(false);
        if paused {
            panic_with_error!(env, HarvestaError::ContractPaused);
        }
    }

    fn issuers(env: &Env) -> Vec<IssuerRecord> {
        env.storage().instance().get(&DataKey::Issuers).unwrap_or_else(|| Vec::new(env))
    }

    fn check_is_issuer(env: &Env, addr: &Address) -> bool {
        let issuers = Self::issuers(env);
        for i in 0..issuers.len() {
            if &issuers.get(i).unwrap().issuer == addr {
                return true;
            }
        }
        false
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    struct Ctx {
        env: Env,
        admin: Address,
        client: TreeRetirementClient<'static>,
    }

    fn setup() -> Ctx {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TreeRetirement);
        let client = TreeRetirementClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        Ctx { env, admin, client }
    }

    fn setup_with_issuer() -> (Ctx, Address) {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        (ctx, issuer)
    }

    fn reason(env: &Env) -> String {
        String::from_str(env, "matured, harvested")
    }

    // ── initialize / issuer management ──────────────────────────────────────

    #[test]
    fn test_initialize_sets_defaults() {
        let ctx = setup();
        assert!(!ctx.client.is_paused());
        assert_eq!(ctx.client.retirement_count(), 0);
        assert_eq!(ctx.client.get_issuers().len(), 0);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let ctx = setup();
        ctx.client.initialize(&ctx.admin);
    }

    #[test]
    fn test_add_issuer_grants_permission() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        assert!(ctx.client.is_issuer(&issuer));
        assert_eq!(ctx.client.get_issuers().len(), 1);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #501)")]
    fn test_add_duplicate_issuer_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.add_issuer(&issuer);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #503)")]
    fn test_remove_last_issuer_rejected() {
        let ctx = setup();
        let issuer = Address::generate(&ctx.env);
        ctx.client.add_issuer(&issuer);
        ctx.client.remove_issuer(&issuer);
    }

    #[test]
    fn test_remove_one_of_multiple_issuers() {
        let ctx = setup();
        let i1 = Address::generate(&ctx.env);
        let i2 = Address::generate(&ctx.env);
        ctx.client.add_issuer(&i1);
        ctx.client.add_issuer(&i2);
        ctx.client.remove_issuer(&i1);
        assert!(!ctx.client.is_issuer(&i1));
        assert!(ctx.client.is_issuer(&i2));
    }

    // ── retire_tree ───────────────────────────────────────────────────────────

    #[test]
    fn test_retire_tree_issues_certificate() {
        let (ctx, issuer) = setup_with_issuer();
        let sponsor = Address::generate(&ctx.env);

        let id = ctx.client.retire_tree(&issuer, &sponsor, &42, &1, &500, &reason(&ctx.env));
        assert_eq!(id, 1);

        let cert = ctx.client.get_retirement_certificate(&id).unwrap();
        assert_eq!(cert.sponsor, sponsor);
        assert_eq!(cert.tree_id, 42);
        assert_eq!(cert.tree_count, 1);
        assert_eq!(cert.co2_offset_kg, 500);
        assert_eq!(cert.retired_by, issuer);
    }

    #[test]
    fn test_retire_tree_marks_tree_permanently_retired() {
        let (ctx, issuer) = setup_with_issuer();
        let sponsor = Address::generate(&ctx.env);

        assert!(!ctx.client.is_tree_retired(&42));
        ctx.client.retire_tree(&issuer, &sponsor, &42, &1, &500, &reason(&ctx.env));
        assert!(ctx.client.is_tree_retired(&42));
    }

    #[test]
    fn test_get_retirement_for_tree() {
        let (ctx, issuer) = setup_with_issuer();
        let sponsor = Address::generate(&ctx.env);
        let id = ctx.client.retire_tree(&issuer, &sponsor, &42, &1, &500, &reason(&ctx.env));

        let cert = ctx.client.get_retirement_for_tree(&42).unwrap();
        assert_eq!(cert.retirement_id, id);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #504)")]
    fn test_retire_already_retired_tree_rejected() {
        let (ctx, issuer) = setup_with_issuer();
        let sponsor = Address::generate(&ctx.env);
        ctx.client.retire_tree(&issuer, &sponsor, &42, &1, &500, &reason(&ctx.env));
        // Same tree_id — permanently blocked, even for a different sponsor.
        let other_sponsor = Address::generate(&ctx.env);
        ctx.client.retire_tree(&issuer, &other_sponsor, &42, &1, &500, &reason(&ctx.env));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #500)")]
    fn test_retire_tree_by_non_issuer_rejected() {
        let ctx = setup();
        let stranger = Address::generate(&ctx.env);
        let sponsor = Address::generate(&ctx.env);
        ctx.client.retire_tree(&stranger, &sponsor, &42, &1, &500, &reason(&ctx.env));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #10)")]
    fn test_retire_tree_zero_tree_count_rejected() {
        let (ctx, issuer) = setup_with_issuer();
        let sponsor = Address::generate(&ctx.env);
        ctx.client.retire_tree(&issuer, &sponsor, &42, &0, &500, &reason(&ctx.env));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #62)")]
    fn test_retire_tree_zero_co2_rejected() {
        let (ctx, issuer) = setup_with_issuer();
        let sponsor = Address::generate(&ctx.env);
        ctx.client.retire_tree(&issuer, &sponsor, &42, &1, &0, &reason(&ctx.env));
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_retire_tree_while_paused_rejected() {
        let (ctx, issuer) = setup_with_issuer();
        let sponsor = Address::generate(&ctx.env);
        ctx.client.pause();
        ctx.client.retire_tree(&issuer, &sponsor, &42, &1, &500, &reason(&ctx.env));
    }

    #[test]
    fn test_retirement_count_increments() {
        let (ctx, issuer) = setup_with_issuer();
        let sponsor = Address::generate(&ctx.env);
        ctx.client.retire_tree(&issuer, &sponsor, &1, &1, &500, &reason(&ctx.env));
        ctx.client.retire_tree(&issuer, &sponsor, &2, &1, &500, &reason(&ctx.env));
        assert_eq!(ctx.client.retirement_count(), 2);
    }

    #[test]
    fn test_multiple_sponsors_independent_certificates() {
        let (ctx, issuer) = setup_with_issuer();
        let s1 = Address::generate(&ctx.env);
        let s2 = Address::generate(&ctx.env);

        let id1 = ctx.client.retire_tree(&issuer, &s1, &1, &1, &500, &reason(&ctx.env));
        let id2 = ctx.client.retire_tree(&issuer, &s2, &2, &1, &500, &reason(&ctx.env));

        assert_eq!(ctx.client.get_retirement_certificate(&id1).unwrap().sponsor, s1);
        assert_eq!(ctx.client.get_retirement_certificate(&id2).unwrap().sponsor, s2);
    }
}
