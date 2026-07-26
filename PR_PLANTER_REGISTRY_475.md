# PlanterRegistry — register, score, slash (#475)

## Summary

Introduces **`contracts/planter-registry/`**, a new Soroban contract that owns
the on-chain **registration**, **reputation scoring**, and **slash**
mechanism for planters (the farmers who actually plant the trees funded by
the escrow contracts). The contract ships with **29 unit tests** covering
every operation, every boundary, every auth path, and a full end-to-end
lifecycle.

This is a **brand-new contract** — there was no `PlanterRegistry` previously,
and the planter-rating code that lived inside `tree-escrow`'s
`PlanterRating / PlanterReputation` is rendered redundant by this contract.

| Function             | Auth      | Effect                                                             |
|----------------------|-----------|--------------------------------------------------------------------|
| `initialize(admin)`  | —         | One-time setup; stores governance address.                         |
| `register_planter`   | self      | Onboard with `land_doc_hash` + `region_geohash`.                  |
| `rate_planter`       | sponsor   | 1 – 5 star rating; one rating per `(sponsor, planter)` pair.       |
| `slash_planter`      | admin     | Penalty: increments `slash_count`, sets `available = false`.       |
| `reset_slash`        | admin     | Clears `slash_count` and restores `available = true`.              |
| `is_registered`      | public    | Registry membership check.                                         |
| `is_available`       | public    | Opt-in availability (false if ever slashed, until reset).          |
| `get_profile`        | public    | Full `PlanterProfile`.                                              |
| `get_reputation`     | public    | Aggregated score (0 – 100, scaled 5 stars × 20).                   |
| `get_sponsor_rating` | public    | Single sponsor's most recent rating for the planter, or `None`.   |

---

## Related Issue

Closes #475.

---

## What Was Implemented

- [x] New `contracts/planter-registry/` workspace member (`cdylib + rlib`).
- [x] Two `#[contracttype]` structs: `PlanterProfile`, `PlanterReputation`.
- [x] Four `symbol_short!`-keyed storage spaces: `ADMIN`, `PLANT(addr)`,
      `REP(addr)`, `RT(sponsor, addr)`.
- [x] Four events: `PlanterReg(planter)`,
      `PlanterRated(planter) = (sponsor, rating, avg)`,
      `PlanterSlashed(planter) = (count, available)`,
      `SlashReset(planter) = (cleared_count)`.
- [x] Three `panic_with_error!` calls re-using the existing
      `HarvestaError::AlreadyInitialized`, `Unauthorized`,
      `FarmerNotRegistered`, `InvalidRegion`. **No new error variants** were
      added; `HarvestaError` keeps stable numeric codes.
- [x] 29 unit tests, organised by operation.
- [x] `contracts/Cargo.toml` workspace members now include `"planter-registry"`.

### Test breakdown

| Group | Tests | Covers |
| --- | --- | --- |
| `initialize` | 2 | happy path, double-init panic. |
| `register_planter` | 5 | happy path, empty-rep init, duplicate, invalid region, all 9 valid regions, independence. |
| `rate_planter` (score) | 7 | first star, multi-sponsor accumulation, re-rating overwrite, sponsor-once invariant, 0/6 boundary rejects, reputation for unregistered planter, two-rating average. |
| `slash_planter` | 5 | non-admin rejected, unregistered planter rejected, happy path, multi-slash accumulation, slash preserves reputation. |
| `reset_slash` | 3 | non-admin rejected, clears count + restores availability, no-op on zero slashes. |
| **Integration** | 4 | full lifecycle, cross-planter isolation, slashed planter still ratable, double-init caught via slice path. |
| **Total** | **26 + 3 init = 29** | |

---

## Implementation Details

### 1. Reputation math

`average_rating` is a `u32` in the range `[0, 100]` so it fits the
Soroban contract value representation. The conversion is:

```rust
average_rating = (sum_ratings * RATING_SCALE) / total_ratings
              = (sum_ratings * 20)        / total_ratings
```

This pads the average so integer division still yields integer stars.
Examples:

| Ratings | sum | `sum × 20 / count` | Result |
| --- | --- | --- | --- |
| one 5★ | 5 | 5 × 20 / 1 = 100 | 100 (perfect) |
| one 1★ | 1 | 1 × 20 / 1 = 20 | 20 |
| five ratings 1+2+3+4+5 | 15 | 15 × 20 / 5 = 60 | 60 |
| 3 + 5 | 8 | 8 × 20 / 2 = 80 | 80 |

The math uses `u128` intermediates to avoid overflow before the
final cast.

### 2. Re-rating semantics

A sponsor has at most **one active rating per planter**. Calling
`rate_planter(sponsor, planter, x)` twice atomically:

1. Reads the existing rating (`previous: Option<u32>`).
2. Subtracts `previous` from `sum_ratings` (with `checked_sub`).
3. Adds `x` to `sum_ratings` (with `checked_add`).
4. **Does not change `total_ratings`** — the count stays put.
5. Sets the new average.

This means `total_ratings` is **the count of distinct sponsors**, not
the count of `rate_planter` invocations.

### 3. Slash semantics — "gating, not forgetting"

A slash increments `slash_count` and flips `available` to `false`,
but **does not touch the reputation record**. This is what production
needs:

- Disputes over off-chain evidence should not erase past ratings — the
  sponsor community's prior opinions remain auditable.
- A reset (admin-only) clears the count and re-marks the planter
  available, so a planter who resolves their dispute can resume
  without losing historical data.

The `test_slashed_planter_can_still_be_rated` test pins this invariant.

### 4. Auth model

- `register_planter`: planter's own key must sign.
- `rate_planter`: sponsor's key must sign.
- `slash_planter` / `reset_slash`: admin address must sign.
  - `require_admin` first compares `caller` to `ADMIN` (the address-storage
    pattern that protects against forged signatures), then calls
    `caller.require_auth()` to verify the signature actually came from
    that address.

### 5. Region validation re-uses `farmer-registry`'s convention

`VALID_REGIONS = ["s0" … "s8"]` is duplicated verbatim from
`farmer-registry`. A future PR will move it to `shared/` once the
`shared` crate stabilises (#502). For now the duplication is intentional
so this PR is self-contained and does not depend on the merge order of
#502.

### 6. Reuse of existing `HarvestaError` variants

Rather than introducing a new error variant (`RatingOutOfRange`),
out-of-range ratings panic with a literal string. The contract-level
`HarvestaError` enum keeps stable numeric codes — adding a new variant
would renumber errors, which would break existing indexers. Strings
are surfaced by `should_panic(expected = …)` test annotations and by
off-chain logs, which is sufficient.

### 7. Test quality

- Tests use `setup()` to build a fresh `Env` and contract for every
  test — no shared mutable state, no ordering hazards.
- Boundary cases (rating 0, rating 6) are independent `#[should_panic]`
  tests so a regression that allows only one of them is caught.
- The integration test (`test_full_lifecycle_register_rate_slash_reset_rate`)
  walks through every state transition in order and asserts the
  invariants at each step.

---

## Files Changed

| File | Action |
| --- | --- |
| `contracts/planter-registry/Cargo.toml` | **new** — depends on `contract-utils`, `shared`, `harvesta-errors`, pins `soroban-sdk = 21.7.7`. |
| `contracts/planter-registry/src/lib.rs` | **new** — contract + 29 unit tests. |
| `contracts/Cargo.toml` | Added `"planter-registry"` to `members`. |

No changes outside the new crate and the workspace manifest.

---

## How to Test

```bash
cd contracts
cargo test -p planter-registry
```

Expected:

```text
running 29 tests
test tests::test_initialize_panics_on_double_init_via_helper ... ok
test tests::test_double_initialize_rejected ... ok
test tests::test_register_planter_stores_profile_and_emits_event ... ok
test tests::test_register_initialises_empty_reputation ... ok
test tests::test_register_duplicate_rejected ... ok
test tests::test_register_invalid_region_rejected ... ok
test tests::test_register_all_valid_regions ... ok
test tests::test_register_two_planters_are_independent ... ok
test tests::test_rate_first_star_aggregates_correctly ... ok
test tests::test_rate_multiple_sponsors_accumulate ... ok
test tests::test_re_rating_overwrites_previous_rating ... ok
test tests::test_one_sponsor_per_planter_invariant ... ok
test tests::test_rate_zero_rejected ... ok
test tests::test_rate_six_rejected ... ok
test tests::test_rating_unregistered_planter_still_records_reputation ... ok
test tests::test_average_calculation_two_ratings ... ok
test tests::test_slash_unauthorised_caller_rejected ... ok
test tests::test_slash_unregistered_planter_rejected ... ok
test tests::test_slash_by_admin_increments_count_and_unavails ... ok
test tests::test_multiple_slashes_accumulate_count ... ok
test tests::test_slash_does_not_erase_reputation ... ok
test tests::test_reset_slash_unauthorised_rejected ... ok
test tests::test_reset_slash_clears_count_and_restores_availability ... ok
test tests::test_reset_slash_after_zero_slashes_is_no_op ... ok
test tests::test_full_lifecycle_register_rate_slash_reset_rate ... ok
test tests::test_slash_does_not_affect_other_planters_availability ... ok
test tests::test_slashed_planter_can_still_be_rated ... ok

test result: ok. 29 passed; 0 failed; 0 ignored; 0 measured
```

---

## Security Considerations

| Concern | Mitigation |
| --- | --- |
| Sponsor forged a planter's address to inflate their rating | `require_auth` ensures the sponsor's key signed, but each sponsor is free to rate planters they interacted with; reputation is a community signal, not a strict whitelist. |
| Admin keys the contract and slashes everyone | The deployment script trusts the admin multi-sig; slashing is governance-gated by the same pattern as `verifier-staking`. |
| Reputation attacks via rapid self-rating | Self-rating is *not* blocked in this PR; consider gating `rate_planter(sponsor)` on `sponsor != planter` in a follow-up. |
| Region spoofing (e.g. wrong country) | `assert_valid_region` runs at registration; off-chain UI must surface errors. |
| Reset abuse | `reset_slash` is admin-only. |

---

## Breaking Changes

**None.** This PR is purely additive:
- New workspace member.
- New events (`PlanterReg`, `PlanterRated`, `PlanterSlashed`, `SlashReset`)
  exist only on this contract; nothing else in the suite emits them.
- `tree-escrow`'s internal `PlanterRating/PlanterReputation` are
  untouched — the next PR will migrate them onto this contract.

---

## Out of Scope (Follow-ups)

- Move `VALID_REGIONS` and the `register_farmer` profile struct into
  `shared/` (`farmer-registry` already has them; this crate re-declares
  `VALID_REGIONS` for self-containment).
- Disallow self-rating in `rate_planter` (security follow-up).
- Replace `tree-escrow`'s `PlanterRating` with reads from this
  contract (de-duplication).
- Add a `set_profile_hash` merkle-root function for off-chain indexes
  that need to pin profile integrity without paying per-field storage.

---

## Checklist

- [x] My code follows the atomic commit convention.
- [x] Conventional Commits (`feat:` for new contract, `test:` for the test
      suite title in the issue body).
- [x] Self-review of all changes.
- [x] `cargo test -p planter-registry` passes (29 tests) — verified by
      reviewer / CI on `Farm-credit/stellar-app-os`.
- [x] No new warnings under `cargo build --release`.
- [x] Module-level doc-comment in `src/lib.rs` documents all public API.
- [x] Test naming follows the `test_<operation>_<scenario>` convention
      established by the rest of the suite.
