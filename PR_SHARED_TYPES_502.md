# Shared Types Crate for FarmCredit Soroban Suite (Closes #502)

## Summary

Introduces a new `contracts/shared/` workspace member that consolidates the
common types, constants, and storage helpers every FarmCredit contract
currently re-declares verbatim. Three submodules are shipped in this
bootstrap PR:

| Submodule | Contents |
| --- | --- |
| `shared::constants` | `BPS_DENOM`, `MAX_FEE_BPS`, and the full family of time constants (`SECONDS_PER_MINUTE` … `SIX_MONTHS_SECS`, `NINETY_DAYS_SECS`). |
| `shared::types` | Generic-feeling `Option<T>` wrappers — `OptAddress`, `OptBytesN32` — that the Soroban `#[contracttype]` macro can derive directly. |
| `shared::storage` | `is_initialised`, `load_admin`, `require_admin` — the contract-init pattern every contract duplicated with slightly different panic strings. |

`admin-controls` is migrated in this PR as a **reference integration**:
its previously-local `OptAddress` enum is replaced with
`pub use shared::OptAddress;` so downstream callers (and the in-file tests)
keep working byte-for-byte.

Migration of the **remaining** contracts (`escrow`, `escrow-milestone`,
`tree-escrow`, `subscription-sponsorship`, `naira-payout`, `kyc-attestation`,
…), once this crate lands, is intentionally **out of scope** and will
follow in dedicated Mkdir PRs to keep the diffs reviewable.

---

## Related Issue

Closes #502

---

## What Was Implemented

- [x] New `contracts/shared/` workspace member:
  - `Cargo.toml`: `cdylib`+`rlib` with `soroban-sdk = "21.7.7"` to match the
    rest of the workspace.
  - `src/lib.rs`: re-exports the most common items for ergonomic
    `use shared::BPS_DENOM;` paths in callers.
  - `src/constants.rs`: `BPS_DENOM`, `MAX_FEE_BPS`, time spans.
  - `src/types.rs`: `OptAddress`, `OptBytesN32`.
  - `src/storage.rs`: `is_initialised`, `load_admin`, `require_admin`.
- [x] 12 unit tests covering constants, types, and storage helpers.
- [x] `contracts/Cargo.toml` workspace members now include `"shared"`.
- [x] **Reference integration:** `contracts/admin-controls`
  - Adds `shared = { path = "../shared" }` to its Cargo dependencies.
  - Removes the local `OptAddress` definition.
  - Re-exports via `pub use shared::OptAddress;` so **zero** downstream
    callers (tests included) need to change.

---

## Implementation Details

### 1. Why a single crate, not per-type crates

The duplication today is real but small. Splitting `constants` / `types` /
`storage` into three crates would multiply `Cargo.toml` and CI surface area
without buying anything; a single crate with three submodules is the right
shape for the current scale.

### 2. Generic `Option<T>`

Soroban's `#[contracttype]` macro does **not** support `Option<T>` directly
(see https://soroban.stellar.org/docs/fundamentals-and-concepts/types),
so contracts invent hand-rolled `enum { None, Some(T) }` shapes. Today the
suite has at least two distinct copies (`OptAddress` in `admin-controls`,
`OptProof` in `escrow-milestone`), and other copies are drifting. The
canonical `OptAddress` lives in `shared::types`; new contracts should use
it verbatim. `OptProof` (which wraps `BytesN<32>`) is included as
`OptBytesN32` — same shape, different inner type.

### 3. Constants are `pub const`, not config

Every value in `constants.rs` is a compile-time literal (`const`). They
cost zero runtime / Wasm bytes and incur no storage reads. Anything that
needs to be **configurable** (e.g. specific refactor thresholds) belongs in
instance storage, not here.

### 4. Storage helpers use `symbol_short!("ADMIN")`

Soroban's `symbol_short!` macro caps keys at 9 ASCII chars; `ADMIN` is 5,
well within the limit. Every contract in the suite already uses the same
key for admin storage, so the helper centralises that contract.

### 5. The `admin-controls` migration is intentionally minimal

The PR diff for `admin-controls/src/lib.rs` is two hunks:

- **Imports / config**: add `shared` to `Cargo.toml`.
- **Type deduplication**: replace the local `enum OptAddress { … }` with
  `pub use shared::OptAddress;`.

That's it. Tests are unchanged — they reference `OptAddress::Some(…)` and
`OptAddress::None` via the contract's own path, which the re-export
satisfies. **No public API of `admin-controls` changes**, so no downstream
contract or indexer sees a breaking event.

---

## File Tree

```text
contracts/
├── Cargo.toml                  ← +"shared"
├── shared/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs              ← re-exports + 12 unit tests
│       ├── constants.rs        ← BPS_DENOM, MAX_FEE_BPS, time spans
│       ├── types.rs            ← OptAddress, OptBytesN32
│       └── storage.rs          ← is_initialised, load_admin, require_admin
├── admin-controls/
│   ├── Cargo.toml              ← +shared
│   └── src/lib.rs              ← local OptAddress replaced with re-export
└── (other contracts — unchanged in this PR)
```

---

## Migration Guide for Future PRs

Once this lands, follow-up PRs can adopt `shared` per-contract. Per
contract, the recipe is:

### `Cargo.toml`

```toml
[dependencies]
shared = { path = "../shared" }
```

### Local `OptAddress` / `OptProof` / etc.

```diff
-#[contracttype]
-#[derive(Clone, Debug, PartialEq)]
-pub enum OptAddress {
-    None,
-    Some(Address),
-}
+pub use shared::OptAddress;
```

### Local `BPS_DENOM` / `SIX_MONTHS_SECS` / etc.

```diff
-const BPS_DENOM: i128 = 10_000;
-const SIX_MONTHS_SECS: u64 = 26 * 7 * 24 * 60 * 60;
+use shared::constants::{BPS_DENOM, SIX_MONTHS_SECS};
```

### Local `require_admin`

```diff
-fn require_admin(env: &Env) {
-    let admin: Address = env.storage().instance()
-        .get(&symbol_short!("ADMIN"))
-        .unwrap_or_else(|| panic_with_error!(env, HarvestaError::NotInitialized));
-    admin.require_auth();
-}
+fn require_admin(env: &Env) {
+    shared::require_admin(env);   // delegates to the shared helper
+}
```

---

## How to Test

```bash
cd contracts
cargo test -p shared
```

Expected:

```text
running 12 tests
test tests::test_bps_denom_is_ten_thousand ... ok
test tests::test_time_constants_environment ... ok
test tests::test_six_months_matches_26_weeks ... ok
test tests::test_ninety_days_window ... ok
test tests::test_opt_address_default_is_none ... ok
test tests::test_opt_address_some_round_trip ... ok
test tests::test_opt_bytes_n32_default_is_none ... ok
test tests::test_opt_bytes_n32_some_round_trip ... ok
test tests::test_is_initialised_false_before_init ... ok
test tests::test_is_initialised_true_after_setting_admin ... ok
test tests::test_load_admin_panics_when_unset ... ok
test tests::test_load_admin_returns_registered_address ... ok

test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured
```

Verify the workspace reservation still works:

```bash
cd contracts
cargo check --workspace --all-targets
```

Verify the `admin-controls` migration is a no-op at the API level:

```bash
cargo test -p admin-controls
```

All `admin-controls` tests should pass unchanged.

---

## Security Considerations

| Concern | Mitigation |
| --- | --- |
| `panic!("admin not initialised")` is a raw string | Consistent with the workspace; not an attack vector because `require_admin()` only runs after the contract has been initialised — the panic cost is bounded. |
| Symbol collision (`ADMIN` shared key) | The shared crate's helpers use the same key that every contract in the suite already uses, so no contract that adopts the helper changes its on-disk layout. Contracts that never adopted the helper were using the same key already (`symbol_short!("ADMIN")`). |
| `shared::OptAddress` re-export breaks downstream | Re-export keeps the local path `crate::OptAddress` working in `admin-controls`; no external crate references the internal enum directly. |
| Soroban version skew | `shared` pins `soroban-sdk = "21.7.7"` to match the rest of the workspace; cargo's resolver pins all of them together. |

---

## Breaking Changes

**None.** This PR is purely additive at the contract / crate level:
- Adds a new workspace member.
- Adds a dependency to one existing crate (`admin-controls`) without
  changing any of its public functions or storage keys.
- Adds nothing to instances of any contract on any network.

---

## Files Changed

| File | Action |
| --- | --- |
| `contracts/Cargo.toml` | Added `"shared"` to `members`. |
| `contracts/shared/Cargo.toml` | **new**. |
| `contracts/shared/src/lib.rs` | **new**. |
| `contracts/shared/src/constants.rs` | **new**. |
| `contracts/shared/src/types.rs` | **new**. |
| `contracts/shared/src/storage.rs` | **new**. |
| `contracts/admin-controls/Cargo.toml` | Added `shared = { path = "../shared" }` to `[dependencies]` and `[dev-dependencies]`. |
| `contracts/admin-controls/src/lib.rs` | Replaced local `OptAddress` definition with `pub use shared::OptAddress;`. |

No front-end, CI, or doc files need to change.

---

## Checklist

- [x] My code follows the atomic commit convention.
- [x] Each commit message follows Conventional Commits (`chore:` for crate-organisation work, `refactor:` for the admin-controls migration).
- [x] Self-review of all changes.
- [x] `cargo test -p shared` passes (12 tests).
- [x] `cargo test -p admin-controls` passes unchanged.
- [x] No new warnings under `cargo build --release`.
- [x] Documentation updated (module-level doc-comment in `lib.rs`).

---

## Out of Scope (Follow-ups)

These are deliberately **not** in this PR. Each is a single-file
migration that will land as its own PR (one per contract) once this
crate has been reviewed:

- Migrate `contracts/escrow/src/lib.rs` to use `shared::constants::BPS_DENOM`.
- Migrate `contracts/escrow-milestone/src/lib.rs` to use `shared::OptBytesN32` (rename `OptProof`).
- Migrate `contracts/tree-escrow/src/lib.rs` to use both.
- Migrate `contracts/subscription-sponsorship/src/lib.rs` to use `shared::SECONDS_PER_MONTH`.
- Migrate `contracts/naira-payout/src/lib.rs` and `contracts/kyc-attestation/src/lib.rs` to use `shared::require_admin`.
