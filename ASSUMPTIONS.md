# Assumptions & Decisions

## Issue #462 — Tree Status State Machine

### Soroban SDK error-code limit
The `#[contracterror]` macro in Soroban SDK 21.7.7 generates XDR spec that exceeds its internal `LengthExceedsMax` limit when the enum has too many variants.

**Decision:** The `harvesta-errors` crate had a pre-existing note ("Error count reduced to stay within Soroban SDK limits") and originally held ~39 codes. After uncommenting the 19 escrow/oracle codes (16–34) and adding the 2 new tree-status codes (90–91), the total reached 62, which still triggered the limit.

The carbon-marketplace codes (100–113, 14 variants) that were added to harvesta-errors AFTER the limit note were therefore removed. Those codes should be moved to a `carbon-marketplace-errors` crate or added back once the SDK limit is raised. The `carbon-marketplace` contract is not affected by `cargo test -p tree-escrow`.

The dispute/arbiter codes (38–46) were also excluded for the same reason and are not referenced by tree-escrow.

### `verify_planting` removed
The `tree-escrow` contract had an incomplete `pub fn verify_planting(` signature that was never closed — a syntax artifact from refactoring to the 5-update streaming model (`verify_progress`). Per plan section 7 (Out of Scope), the artifact was removed and all tests updated to use `verify_progress` (5 × 10% calls) instead.

### `verify_progress` bug fixed (not in scope but necessary)
The original `verify_progress` contained two bugs left over from the planting-verification merge:
1. It incorrectly added `tranche1` (30%) to `rec.released` on every call, in addition to `stream_amount`.
2. It reset `planted_at` and `planting_proof` on every subsequent call (not just the first).

Both were removed as part of making `cargo test -p tree-escrow` pass.

### `verify_year_milestone` check order
`verify_year_milestone` previously checked `status != Survived` before computing remaining balance. This caused the double-call test (`test_year_milestone_double_call_rejected`) to panic with "survival not yet verified" instead of "nothing left to release" after a first successful call sets `status = Completed`. The check order was reversed: `tranche3 <= 0` is checked first.

### XDR re-registration note
Adding fields to `TreeFunding` (`tree_status`, `registered_at`, `planted_at`, `verified_at`) changes the on-chain XDR encoding. All existing `TreeFunding` records on testnet must be re-registered after deploying this version.
