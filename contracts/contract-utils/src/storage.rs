//! Storage-class policy and helpers shared by every Farm Credit contract.
//!
//! # Why this module exists
//!
//! Soroban exposes three storage classes with very different ledger-footprint
//! costs:
//!
//! | Class | TTL behaviour | Footprint cost | Use for |
//! |-------|---------------|----------------|---------|
//! | [`StorageClass::Instance`] | one TTL per contract, bumped on every instance access | paid only while the contract is invoked | small, hot, contract-wide state |
//! | [`StorageClass::Temporary`] | one TTL per entry, **not** kept in the ledger after it expires | grows only for the TTL window | caches and short-lived replay guards |
//! | [`StorageClass::Persistent`] | one TTL per entry, archived (restorable) after expiry | paid for as long as the entry lives | balances, ownership, audit records |
//!
//! Putting short-lived state in persistent storage keeps otherwise dead
//! entries in the live ledger (and in every transaction footprint that
//! touches them) forever. Conversely, putting per-user records in instance
//! storage grows a single shared footprint that every caller has to pay for.
//!
//! [`DataLifetime`] encodes the audit decision that was performed across
//! `contracts/`, and [`storage_class`](DataLifetime::storage_class) is the
//! single source of truth for which class a given kind of state must use.
//! Contracts should call the helpers in this module instead of reaching for
//! `env.storage().persistent()` by habit.

use soroban_sdk::{Env, IntoVal, TryFromVal, Val};

/// The Soroban storage class a value should be written to.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StorageClass {
    /// Contract-wide state sharing one auto-bumped TTL.
    Instance,
    /// TTL-bounded state that leaves the live ledger once expired.
    Temporary,
    /// Durable, per-key state that must survive independently.
    Persistent,
}

/// Semantic category of a stored value, used to pick its storage class.
///
/// This is deliberately about the *lifetime* of the data, not its type: a
/// `u64` can be a counter (instance) or a receipt id (persistent).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DataLifetime {
    /// Admin, token addresses, fee configuration, pause flags.
    Config,
    /// Monotonic ids and totals that are read on almost every call.
    Counter,
    /// Hot accumulator whose old values are never read again
    /// (TWAP accumulator, latest price, current round).
    HotAccumulator,
    /// Recomputable result kept only to avoid repeated work.
    Cache,
    /// One-shot marker preventing a message/sale/proof from being replayed
    /// inside a bounded settlement window.
    ReplayGuard,
    /// Ledger entry that must be auditable for the life of the protocol.
    AuditRecord,
    /// Token balance or entitlement attached to an address.
    Balance,
    /// Ownership / role membership attached to an address.
    Ownership,
}

impl DataLifetime {
    /// Return the storage class mandated by the cross-contract audit.
    pub const fn storage_class(self) -> StorageClass {
        match self {
            DataLifetime::Config | DataLifetime::Counter | DataLifetime::HotAccumulator => {
                StorageClass::Instance
            }
            DataLifetime::Cache | DataLifetime::ReplayGuard => StorageClass::Temporary,
            DataLifetime::AuditRecord | DataLifetime::Balance | DataLifetime::Ownership => {
                StorageClass::Persistent
            }
        }
    }
}

/// Ledgers a temporary replay guard stays in the live ledger
/// (518_400 * 5s = 30 days, matching the persistent TTL used elsewhere in the
/// contract suite).
pub const REPLAY_GUARD_TTL_LEDGERS: u32 = 518_400;

/// Ledgers a recomputable cache stays in the live ledger (30 days).
pub const CACHE_TTL_LEDGERS: u32 = 518_400;

/// Write `value` under `key` using `class`, extending the TTL when the class
/// is per-entry. Instance storage deliberately gets no explicit TTL: its TTL
/// is extended automatically whenever any instance entry is accessed.
pub fn set<K, V>(env: &Env, class: StorageClass, key: &K, value: &V, ttl: u32)
where
    K: IntoVal<Env, Val>,
    V: IntoVal<Env, Val>,
{
    match class {
        StorageClass::Instance => {
            env.storage().instance().set(key, value);
        }
        StorageClass::Temporary => {
            let storage = env.storage();
            let entries = storage.temporary();
            entries.set(key, value);
            entries.extend_ttl(key, ttl, ttl);
        }
        StorageClass::Persistent => {
            let storage = env.storage();
            let entries = storage.persistent();
            entries.set(key, value);
            entries.extend_ttl(key, ttl, ttl);
        }
    }
}

/// Read `key` from `class`.
pub fn get<K, V>(env: &Env, class: StorageClass, key: &K) -> Option<V>
where
    K: IntoVal<Env, Val>,
    V: TryFromVal<Env, Val>,
    V::Error: core::fmt::Debug,
{
    match class {
        StorageClass::Instance => env.storage().instance().get(key),
        StorageClass::Temporary => env.storage().temporary().get(key),
        StorageClass::Persistent => env.storage().persistent().get(key),
    }
}

/// Whether `key` is present in `class`.
pub fn has<K>(env: &Env, class: StorageClass, key: &K) -> bool
where
    K: IntoVal<Env, Val>,
{
    match class {
        StorageClass::Instance => env.storage().instance().has(key),
        StorageClass::Temporary => env.storage().temporary().has(key),
        StorageClass::Persistent => env.storage().persistent().has(key),
    }
}

/// Remove `key` from `class`.
pub fn remove<K>(env: &Env, class: StorageClass, key: &K)
where
    K: IntoVal<Env, Val>,
{
    match class {
        StorageClass::Instance => env.storage().instance().remove(key),
        StorageClass::Temporary => env.storage().temporary().remove(key),
        StorageClass::Persistent => env.storage().persistent().remove(key),
    }
}

/// Set a short-lived replay guard in temporary storage.
pub fn mark_replay_guard<K>(env: &Env, key: &K)
where
    K: IntoVal<Env, Val>,
{
    set(
        env,
        DataLifetime::ReplayGuard.storage_class(),
        key,
        &true,
        REPLAY_GUARD_TTL_LEDGERS,
    );
}

/// Whether a short-lived replay guard is still active.
pub fn replay_guard_active<K>(env: &Env, key: &K) -> bool
where
    K: IntoVal<Env, Val>,
{
    has(env, DataLifetime::ReplayGuard.storage_class(), key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{contract, contractimpl, symbol_short, testutils::Ledger, Address};

    #[contract]
    struct StorageHarness;

    #[contractimpl]
    impl StorageHarness {
        pub fn noop(_env: Env) {}
    }

    fn env_with_contract() -> (Env, Address) {
        let env = Env::default();
        let id = env.register(StorageHarness, ());
        (env, id)
    }

    #[test]
    fn config_counter_and_accumulator_use_instance_storage() {
        assert_eq!(DataLifetime::Config.storage_class(), StorageClass::Instance);
        assert_eq!(
            DataLifetime::Counter.storage_class(),
            StorageClass::Instance
        );
        assert_eq!(
            DataLifetime::HotAccumulator.storage_class(),
            StorageClass::Instance
        );
    }

    #[test]
    fn cache_and_replay_guard_use_temporary_storage() {
        assert_eq!(DataLifetime::Cache.storage_class(), StorageClass::Temporary);
        assert_eq!(
            DataLifetime::ReplayGuard.storage_class(),
            StorageClass::Temporary
        );
    }

    #[test]
    fn records_balances_and_roles_use_persistent_storage() {
        assert_eq!(
            DataLifetime::AuditRecord.storage_class(),
            StorageClass::Persistent
        );
        assert_eq!(
            DataLifetime::Balance.storage_class(),
            StorageClass::Persistent
        );
        assert_eq!(
            DataLifetime::Ownership.storage_class(),
            StorageClass::Persistent
        );
    }

    #[test]
    fn helpers_round_trip_each_storage_class() {
        let (env, id) = env_with_contract();
        env.as_contract(&id, || {
            let key = symbol_short!("K");
            for class in [
                StorageClass::Instance,
                StorageClass::Temporary,
                StorageClass::Persistent,
            ] {
                remove(&env, class, &key);
                assert!(!has(&env, class, &key));
                set(&env, class, &key, &42u64, 100);
                assert!(has(&env, class, &key));
                assert_eq!(get::<_, u64>(&env, class, &key), Some(42u64));
                remove(&env, class, &key);
                assert!(!has(&env, class, &key));
            }
        });
    }

    #[test]
    fn replay_guard_helpers_use_temporary_storage() {
        let (env, id) = env_with_contract();
        env.as_contract(&id, || {
            let key = (symbol_short!("RG"), 7u64);
            assert!(!replay_guard_active(&env, &key));
            mark_replay_guard(&env, &key);
            assert!(replay_guard_active(&env, &key));
            assert!(has(&env, StorageClass::Temporary, &key));
            assert!(!has(&env, StorageClass::Persistent, &key));
        });
    }

    #[test]
    fn replay_guard_expires_when_ttl_elapses() {
        let (env, id) = env_with_contract();
        let key = (symbol_short!("RG"), 9u64);
        env.as_contract(&id, || mark_replay_guard(&env, &key));
        env.ledger().with_mut(|ledger| {
            ledger.sequence_number += REPLAY_GUARD_TTL_LEDGERS + 1;
        });
        env.as_contract(&id, || assert!(!replay_guard_active(&env, &key)));
    }
}
