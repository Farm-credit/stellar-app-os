#![no_std]

//! Planter Blacklist Contract — Closes #505
//!
//! Governance-managed blacklist for planters who have permanently
//! misbehaved (fraud, planting false certificates, repeated slashes,
//! off-chain disputes upheld, etc.). A blacklisted planter:
//!
//!   - **Cannot accept new jobs** — every consumer contract that gates
//!     planter availability (e.g. `subscription-sponsorship`,
//!     `tree-escrow`, `carbon-marketplace`) is expected to cross-call
//!     `planter_blacklist.is_blacklisted(planter)`.
//!   - **Cannot withdraw bonds** — same as above; consumer contracts
//!     holding a planter's escrow / bond must reject the release.
//!
//! The contract itself just stores the blacklist state and exposes
//! read / write hooks. It does **not** push denials into other
//! contracts; that is enforced by the consumer contracts checking
//! `is_blacklisted` before performing planter-bound operations.
//!
//! # Operations
//!
//! | Function             | Auth   | Effect                                                          |
//! |----------------------|--------|-----------------------------------------------------------------|
//! | `initialize(admin)`  | —      | One-time setup. Stores `ADMIN` (multi-sig in production).       |
//! | `blacklist`          | admin  | Add `planter` to the blacklist with `reason_hash`.              |
//! | `unblacklist`        | admin  | Remove `planter` from the blacklist (rare; appeals process).    |
//! | `is_blacklisted`     | public | Blacklist membership check.                                     |
//! | `get_entry`          | public | Full `BlacklistEntry` for audit / off-chain display.             |
//! | `get_admin`          | public | Current governance address (read-only).                         |
//!
//! # Storage
//!
//!   - Instance: `ADMIN` (governance address).
//!   - Persistent: `BL(planter) -> BlacklistEntry`.
//!
//! # Events
//!
//!   - `Blacklisted(planter) = (reason_hash, by, at)` on every `blacklist`.
//!     On idempotent re-calls (`blacklist` on an already-blacklisted
//!     planter), the event fires with the *original* `reason_hash`,
//!     `blacklisted_by`, and `blacklisted_at` — the audit trail is
//!     immutable. Downstream indexers can treat re-affirmation events
//!     as no-ops for state but use them to re-sync after a partial
//!     write loss.
//!   - `Unblacklisted(planter) = (by, at, was_present)` on every `unblacklist`.
//!     `was_present` is `true` if the entry existed before the call,
//!     `false` for the idempotent no-op case — so off-chain loggers can
//!     distinguish a real unban from a redundant call.
//!
//! # Idempotency
//!
//!   - `blacklist` on already-blacklisted planter is **idempotent** (no
//!     error): the original entry's `blacklisted_at`, `blacklisted_by`,
//!     and `reason_hash` are preserved so the audit history is
//!     immutable. The event still fires.
//!   - `unblacklist` on non-blacklisted planter is **idempotent** (no
//!     error): no entry is removed (none exists), but the event still
//!     fires with `was_present = false` so off-chain consumers can
//!     re-sync.
//!
//! # Cross-contract surface
//!
//! This contract stores the blacklist but does not push denials.
//! Consumer contracts MUST cross-call `is_blacklisted(planter)` before
//! any planter-bound operation. The known call sites (out of scope for
//! this PR, follow-up PRs will add them) are:
//!
//!   - `subscription-sponsorship::process` — reject subscription target.
//!   - `subscription-sponsorship::setup`   — reject planter selection.
//!   - `tree-escrow::deposit`              — reject fundraiser for bad actor.
//!   - `tree-escrow::register_tree`        — reject new co-funded tree.
//!   - `carbon-marketplace::list`          — reject bad-actor listings.
//!   - `escrow-milestone::deposit`         — reject bad-actor fixers.
//!
//! # Self-blacklist
//!
//! The contract does **not** forbid `blacklist(admin, admin, ...)`. A
//! governance self-ban is permitted and is a deployment concern: the
//! production deployment script can either (a) refuse to seed `ADMIN`
//! with a banned address, or (b) rotate `ADMIN` via a multi-sig proposal
//! step before self-banning.

use harvesta_errors::HarvestaError;
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, Address, BytesN, Env,
    IntoVal, Symbol,
};

// ── Types ─────────────────────────────────────────────────────────────────────

/// On-chain audit record for a blacklisted planter.
///
/// `reason_hash` is the SHA-256 of the off-chain ticket / dispute
/// decision that motivated the ban. Keeping the hash on-chain lets an
/// auditor cross-reference without pinning PII into the contract.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct BlacklistEntry {
    pub planter: Address,
    pub reason_hash: BytesN<32>,
    pub blacklisted_at: u64,
    pub blacklisted_by: Address,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

fn admin_key() -> soroban_sdk::Symbol {
    symbol_short!("ADMIN")
}

fn blacklist_key(env: &Env, planter: &Address) -> soroban_sdk::Val {
    (symbol_short!("BL"), planter.clone()).into_val(env)
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct PlanterBlacklist;

#[contractimpl]
impl PlanterBlacklist {
    /// One-time setup. `admin` is the only address that may add or
    /// remove planters from the blacklist.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&admin_key()) {
            panic_with_error!(&env, HarvestaError::AlreadyInitialized);
        }
        env.storage().instance().set(&admin_key(), &admin);
    }

    /// Governance adds `planter` to the blacklist. Idempotent: calling
    /// twice for the same planter preserves the original entry
    /// (immutable audit trail) and still emits the event.
    pub fn blacklist(env: Env, admin: Address, planter: Address, reason_hash: BytesN<32>) {
        Self::require_admin(&env, &admin);

        let key = blacklist_key(&env, &planter);
        if env.storage().persistent().has(&key) {
            // Idempotent: do not overwrite the existing entry — audit trail
            // is immutable. The event still fires with the *original* fields
            // so off-chain indexers can re-sync.
            let existing: BlacklistEntry = env.storage().persistent().get(&key).unwrap();
            env.events().publish(
                (Symbol::new(&env, "Blacklisted"), planter.clone()),
                (existing.reason_hash, existing.blacklisted_by, existing.blacklisted_at),
            );
            return;
        }

        let entry = BlacklistEntry {
            planter: planter.clone(),
            reason_hash,
            blacklisted_at: env.ledger().timestamp(),
            blacklisted_by: admin.clone(),
        };
        env.storage().persistent().set(&key, &entry);

        env.events().publish(
            (Symbol::new(&env, "Blacklisted"), planter.clone()),
            (entry.reason_hash, entry.blacklisted_by, entry.blacklisted_at),
        );
    }

    /// Governance removes `planter` from the blacklist. Idempotent:
    /// calling on a non-blacklisted planter is a no-op (no entry is
    /// removed because none exists). The event fires either way so
    /// off-chain loggers can re-sync; the data carries a `was_present`
    /// flag so consumers can distinguish a real unban from a redundant
    /// call.
    pub fn unblacklist(env: Env, admin: Address, planter: Address) {
        Self::require_admin(&env, &admin);

        let key = blacklist_key(&env, &planter);
        let was_present = env.storage().persistent().has(&key);
        if was_present {
            env.storage().persistent().remove(&key);
        }

        env.events().publish(
            (Symbol::new(&env, "Unblacklisted"), planter.clone()),
            (admin, env.ledger().timestamp(), was_present),
        );
    }

    /// Returns `true` iff `planter` is currently on the blacklist.
    pub fn is_blacklisted(env: Env, planter: Address) -> bool {
        env.storage()
            .persistent()
            .has(&blacklist_key(&env, &planter))
    }

    /// Returns the full `BlacklistEntry` for `planter`, or `None`.
    pub fn get_entry(env: Env, planter: Address) -> Option<BlacklistEntry> {
        env.storage()
            .persistent()
            .get(&blacklist_key(&env, &planter))
    }

    /// Returns the registered admin. Panics if not initialised.
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&admin_key())
            .unwrap_or_else(|| panic_with_error!(&env, HarvestaError::NotInitialized))
    }

    // ── internal ──────────────────────────────────────────────────────────────

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&admin_key())
            .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
        if *caller != admin {
            panic_with_error!(env, HarvestaError::Unauthorized);
        }
        caller.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger}, Address, BytesN, Env};

    fn setup() -> (Env, Address, PlanterBlacklistClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PlanterBlacklist);
        let client = PlanterBlacklistClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    fn reason_hash(env: &Env, seed: u8) -> BytesN<32> {
        BytesN::from_array(env, &[seed; 32])
    }

    // ── initialize ───────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_sets_admin() {
        let (env, admin, client) = setup();
        assert_eq!(client.get_admin(), admin);
        let _ = env;
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_double_initialize_rejected() {
        let (_env, _admin, client) = setup();
        let imposter = Address::generate(&_env);
        client.initialize(&imposter);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_admin_panics_when_uninitialised() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PlanterBlacklist);
        let client = PlanterBlacklistClient::new(&env, &contract_id);
        let _ = client.get_admin();
    }

    // ── blacklist ────────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_blacklist_unauthorised_caller_rejected() {
        let (env, _admin, client) = setup();
        let planter = Address::generate(&env);
        let imposter = Address::generate(&env);
        client.blacklist(&imposter, &planter, &reason_hash(&env, 1));
    }

    #[test]
    fn test_blacklist_happy_path() {
        let (env, admin, client) = setup();
        let planter = Address::generate(&env);

        assert!(!client.is_blacklisted(&planter));
        client.blacklist(&admin, &planter, &reason_hash(&env, 7));
        assert!(client.is_blacklisted(&planter));

        let entry = client.get_entry(&planter).unwrap();
        assert_eq!(entry.planter, planter);
        assert_eq!(entry.reason_hash, reason_hash(&env, 7));
        assert_eq!(entry.blacklisted_by, admin);
        assert_eq!(entry.blacklisted_at, env.ledger().timestamp());
    }

    #[test]
    fn test_blacklist_is_idempotent_and_preserves_original_entry() {
        let (env, admin, client) = setup();
        let planter = Address::generate(&env);

        // First ban with reason seed 1.
        let original_at = {
            client.blacklist(&admin, &planter, &reason_hash(&env, 1));
            client.get_entry(&planter).unwrap().blacklisted_at
        };

        // Advance time so we can prove the second call does NOT overwrite.
        env.ledger().with_mut(|l| {
            l.timestamp = original_at + 1_000;
        });

        // Second "ban" with reason seed 2 — must NOT change the entry.
        client.blacklist(&admin, &planter, &reason_hash(&env, 2));

        let entry_after = client.get_entry(&planter).unwrap();
        assert_eq!(
            entry_after.reason_hash,
            reason_hash(&env, 1),
            "second blacklist call must preserve the original reason"
        );
        assert_eq!(
            entry_after.blacklisted_at, original_at,
            "second blacklist call must preserve the original timestamp"
        );
        assert_eq!(entry_after.blacklisted_by, admin);
    }

    #[test]
    fn test_blacklist_storage_keys_are_per_planter() {
        let (env, admin, client) = setup();
        let a = Address::generate(&env);
        let b = Address::generate(&env);

        client.blacklist(&admin, &a, &reason_hash(&env, 1));
        assert!(client.is_blacklisted(&a));
        assert!(!client.is_blacklisted(&b));

        client.blacklist(&admin, &b, &reason_hash(&env, 2));
        assert!(client.is_blacklisted(&a));
        assert!(client.is_blacklisted(&b));

        let entry_a = client.get_entry(&a).unwrap();
        let entry_b = client.get_entry(&b).unwrap();
        assert_eq!(entry_a.reason_hash, reason_hash(&env, 1));
        assert_eq!(entry_b.reason_hash, reason_hash(&env, 2));
    }

    #[test]
    fn test_blacklist_distinct_zero_reason_hash_works() {
        // Boundary: a hash of all-zeros is a valid reason hash. We must
        // not mistake it for "uninitialized" storage.
        let (env, admin, client) = setup();
        let planter = Address::generate(&env);

        let zero = BytesN::from_array(&env, &[0u8; 32]);
        client.blacklist(&admin, &planter, &zero);

        assert!(client.is_blacklisted(&planter));
        let entry = client.get_entry(&planter).unwrap();
        assert_eq!(entry.reason_hash, zero);
    }

    // ── unblacklist ──────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_unblacklist_unauthorised_rejected() {
        let (env, admin, client) = setup();
        let planter = Address::generate(&env);
        client.blacklist(&admin, &planter, &reason_hash(&env, 1));

        let imposter = Address::generate(&env);
        client.unblacklist(&imposter, &planter);
    }

    #[test]
    fn test_unblacklist_removes_entry() {
        let (env, admin, client) = setup();
        let planter = Address::generate(&env);
        client.blacklist(&admin, &planter, &reason_hash(&env, 1));
        assert!(client.is_blacklisted(&planter));

        client.unblacklist(&admin, &planter);

        assert!(!client.is_blacklisted(&planter));
        assert!(client.get_entry(&planter).is_none());
    }

    #[test]
    fn test_unblacklist_is_idempotent_on_missing_entry() {
        // Calling unblacklist on a never-blacklisted planter must not
        // panic. This matters because off-chain apps may re-attempt on
        // ambiguity (e.g. after a partial failed batch sync).
        let (env, admin, client) = setup();
        let phantom_planter = Address::generate(&env);

        // No panic expected.
        client.unblacklist(&admin, &phantom_planter);
        assert!(!client.is_blacklisted(&phantom_planter));
        // The storage slot must remain empty (no spurious write).
        assert!(client.get_entry(&phantom_planter).is_none());
    }

    #[test]
    fn test_re_blacklist_after_unblacklist_creates_fresh_entry() {
        // After unblacklist, a re-blacklist must produce a fresh entry
        // (new timestamp) — the old entry's timestamp is gone with the
        // unblacklist remove.
        let (env, admin, client) = setup();
        let planter = Address::generate(&env);

        client.blacklist(&admin, &planter, &reason_hash(&env, 1));
        let first_at = client.get_entry(&planter).unwrap().blacklisted_at;

        env.ledger().with_mut(|l| {
            l.timestamp = first_at + 10_000;
        });
        client.unblacklist(&admin, &planter);

        env.ledger().with_mut(|l| {
            l.timestamp = first_at + 20_000;
        });
        client.blacklist(&admin, &planter, &reason_hash(&env, 2));

        let entry = client.get_entry(&planter).unwrap();
        assert_eq!(entry.reason_hash, reason_hash(&env, 2));
        assert_eq!(entry.blacklisted_at, first_at + 20_000);
        assert!(client.is_blacklisted(&planter));
    }

    // ── queries ──────────────────────────────────────────────────────────────

    #[test]
    fn test_is_blacklisted_returns_false_for_unknown_planter() {
        let (env, _admin, client) = setup();
        let stranger = Address::generate(&env);
        assert!(!client.is_blacklisted(&stranger));
        assert!(client.get_entry(&stranger).is_none());
    }

    #[test]
    fn test_get_admin_returns_registered_address() {
        let (_env, admin, client) = setup();
        assert_eq!(client.get_admin(), admin);
    }

    // ── cross-cutting / governance ───────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Error(Contract, #3)")]
    fn test_admin_storage_mismatch_panics_with_unauthorized() {
        // Defender-of-defenders scenario: even if a fake "admin" param is
        // passed, the storage-side comparison must reject it.
        let (env, _real_admin, client) = setup();
        let planter = Address::generate(&env);
        let fake_admin = Address::generate(&env);
        client.blacklist(&fake_admin, &planter, &reason_hash(&env, 1));
    }

    #[test]
    fn test_two_distinct_admins_via_double_init_pattern_after_reset() {
        // Defensive coverage: a separate admin instance can be set up
        // by re-registering via a fresh Env. Here we just verify the
        // first admin's binds hold across multiple blacklist sets.
        let (env, admin, client) = setup();
        for i in 0..10u8 {
            let planter = Address::generate(&env);
            client.blacklist(&admin, &planter, &reason_hash(&env, i));
            assert!(client.is_blacklisted(&planter));
        }
        assert_eq!(client.get_admin(), admin);
    }

    #[test]
    fn test_storage_persistence_under_repeated_blacklist_unblacklist() {
        // A planter can be blacklisted, unbanned, blacklisted again,
        // unbanned again — each cycle must leave storage in a
        // consistent state.
        let (env, admin, client) = setup();
        let planter = Address::generate(&env);

        for cycle in 0u32..3u32 {
            client.blacklist(&admin, &planter, &reason_hash(&env, cycle as u8));
            assert!(client.is_blacklisted(&planter));
            client.unblacklist(&admin, &planter);
            assert!(!client.is_blacklisted(&planter));
            assert!(client.get_entry(&planter).is_none());
        }
    }

    #[test]
    fn test_blacklisted_address_can_be_admins_own_address() {
        // Edge: a planter's address happens to equal the admin's —
        // this should still be stored. Governance of self-blacklist
        // is a deployment concern, not a contract invariant.
        let (env, admin, client) = setup();
        client.blacklist(&admin, &admin, &reason_hash(&env, 9));
        assert!(client.is_blacklisted(&admin));
        let entry = client.get_entry(&admin).unwrap();
        assert_eq!(entry.planter, admin);
        assert_eq!(entry.blacklisted_by, admin);
    }
}
