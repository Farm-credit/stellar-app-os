# Planter Reputation Scoring Engine (issue [#1812](https://github.com/Farm-credit/stellar-app-os/issues/1812))

Status: **implemented** — crate `contracts/planter-reputation`.

## Purpose

Farm Credit distributes CARBON tokens and NFT impact certificates for verified
ecological impact. The same reputation rules must apply to a farmer with a plot
and to a non-farmer community tree steward (urban planter, school, verifier).
This contract is the persistent, on-chain ledger of that reputation: scoring is
computed by the contract itself from verified milestones instead of being
trusted to an off-chain database.

## Roles and workflow

| Role | Authority | Actions |
| ---- | --------- | ------- |
| admin | `initialize` caller | manage verifiers, weights, penalties and steward status |
| verifier | registered by admin | `record_milestone` once per unique milestone reference |
| steward | self-registered or imported by admin | read own profile/ledger, accept jobs gated on `is_eligible` |

1. `initialize(admin)` sets default weights and an empty verifier set.
2. `register_steward(steward, kind)` (steward signature) or
   `register_steward_for(admin, steward, kind)` creates a profile for either a
   `Farmer` or a `CommunitySteward`. Both start at score `100`, tier `Bronze`,
   active, with an empty ledger.
3. A verifier calls `record_milestone(verifier, steward, reference, outcome,
   trees)`. The 32-byte `reference` is a unique external milestone id (for
   example a hash of the escrow milestone id) and acts as a **permanent replay
   guard**: reusing it is rejected even by a different verifier or for a
   different steward.
4. The engine recomputes the score, derives the tier, and appends an immutable
   `MilestoneRecord` with the signed delta, tree count, timestamp and resulting
   score to the steward's ledger.
5. `apply_penalty(admin, steward, points, reference)` handles disputes and
   blacklist decisions with the same guard. `set_active` suspends or restores a
   steward without erasing history.

## Scoring formula

With the default `ScoreWeights`:

```text
success delta  = success_points + min(trees / tree_bonus_divisor, max_tree_bonus)
               = 10            + min(trees / 10, 5)
failure delta  = -failure_penalty = -20
admin penalty  = -points       (1..=1000)

new score      = clamp(score + delta, 0, max_score=1000)
```

| score | tier |
| ----- | ---- |
| 0..299 | Bronze |
| 300..599 | Silver |
| 600..899 | Gold |
| 900..1000 | Platinum |

Tier thresholds deliberately match `planter-registry`'s existing ladder so
benefactor UI and job gates stay consistent. `success_points`,
`failure_penalty`, `tree_bonus_divisor`, `max_tree_bonus`, `initial_score` and
`max_score` are admin-configurable through `set_weights`, which validates that
no weight is zero where division or scoring depends on it.

## Storage policy

Following the shared policy in `contracts/contract-utils/src/storage.rs`:

- **Instance** — admin, verifier list, weights, next-entry id, steward count.
- **Persistent** — profiles, ledger entries, per-steward id lists and the
  milestone reference replay markers, with a 518,400-ledger (~30 day) TTL
  extension on write. A reputation receipt must never expire, so replay
  markers use the `AuditRecord` lifetime rather than the shorter `ReplayGuard`
  lifetime used for settlement caches.

## Error boundaries and client states

The crate owns namespace `0x3A` (index 57) of the shared error standard; its 15
typed errors are compile-time pinned to `global_code(57, local)`. Views return
`Option` or `false` for unknown/ineligible stewards, so a client can render an
empty/loading/ineligible state without a failing transaction. Mutating entry
points fail explicitly for: uninitialized contract, non-admin caller, unknown
or removed verifier, unknown or duplicate steward, inactive steward, duplicate
milestone reference, invalid weights, invalid tree count, invalid penalty and
the `Penalty` outcome passed to `record_milestone`.

Six contract events (`StewardRegistered`, `MilestoneRecorded`, `PenaltyApplied`,
`VerifierUpdated`, `WeightsUpdated`, `ActivityChanged`) let indexers update
read models without polling storage.

## Verification

```sh
cd contracts
cargo fmt -p planter-reputation -p harvesta-errors -- --check
cargo test --offline -p planter-reputation -p harvesta-errors
cargo clippy --offline -p planter-reputation --all-targets --all-features --no-deps -- \
  -D warnings -D clippy::all -D clippy::pedantic
```

19 contract tests and 13 registry tests cover registration of both steward
kinds, scoring and clamping, tier transitions, ledger ordering, replay guards,
penalty bounds, weights validation, auth boundaries and eligibility views.
