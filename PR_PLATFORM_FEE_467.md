# Platform Fee on Escrow Release (Closes #467)

## Summary

Adds a configurable **platform fee**, denominated in **basis points**, to the
simplest escrow contract (`contracts/escrow`). Every `release(tree_id)` now
deducts `fee_bps / 10_000` of the gross amount and routes it to a
**platform treasury address** before paying the planter. The fee is
governed by a separate admin role so a compromised verifier/oracle cannot
redirect future releases, and the `FundsRel` event topic is preserved
verbatim so existing indexers keep working — the fee leg is emitted as a
new `FeeColl(tree_id)` event.

| Property | Value |
| --- | --- |
| Default fee | `200 bps` = **2.00 %** |
| Range | `0 bps` (no fee) … `10_000 bps` (100 %) |
| Stored in | instance storage, key `FEE_BPS` (`u32`) |
| Governance | `set_fee_bps(bps)` and `set_treasury(addr)` are **`admin`**-only |
| Treasury | arbitrary `Address` — production can point at `contracts/treasury` (the 2-of-3 multisig) |
| Verifier role | **unchanged** — still the only party that can call `release()` |
| Event shape | `FundsRel(tree_id)` tuple stays `(planter, planter_amount)`; new `FeeColl(tree_id) = (treasury, fee, fee_bps)` |

---

## Related Issue

Closes #467

---

## What Was Implemented

- [x] `DEFAULT_FEE_BPS = 200`, `MAX_FEE_BPS = 10_000`, `BPS_DENOM = 10_000` as contract constants.
- [x] `EscrowError::PlatformFeeBpsOutOfRange`, `PlatformFeeTreasuryNotSet`, `UnauthorizedAdmin` (errors `8`, `9`, `10` — added after the existing `1..7`).
- [x] `initialize(env, admin, verifier, treasury, fee_bps)` — now takes four arguments; bounds-checks `fee_bps ≤ MAX_FEE_BPS`.
- [x] `set_fee_bps(bps)` — admin-only, emits `FeeUpd(bps, timestamp)` for audit trail.
- [x] `set_treasury(addr)` — admin-only, emits `TreasUpd(addr, timestamp)`.
- [x] `get_fee_bps() -> u32`, `get_treasury() -> Address` — public read helpers.
- [x] `release(tree_id)`:
  - `fee = amount.checked_mul(fee_bps).checked_div(10_000)` (overflow-safe).
  - Transfers `fee` from the escrow to the treasury (only when `fee > 0`).
  - Transfers `amount - fee` to the planter.
  - Emits `FundsRel(tree_id)` with `(planter, planter_amount)` — **shape unchanged** so existing indexers & dApps keep working.
  - When `fee > 0`, additionally emits `FeeColl(tree_id)` with `(treasury, fee, fee_bps)`.
- [x] `refund(tree_id)` — **fee is ignored** on refund (the sponsor still gets back 100 %).
- [x] `deposit`, `get_escrow`, escrow-key derivation — unchanged.

### Tests added (all pass on `cargo test -p escrow`)

| Test | Asserts |
| --- | --- |
| `test_initialize_stores_literal_fee_bps` | `initialize(fee_bps=0)` stores `0` (no fee). |
| `test_initialize_rejects_fee_bps_above_max` | `fee_bps = 10_001` panics with `Error(Contract, #8)`. |
| `test_release_deducts_platform_fee_default` | 2 % fee: planter gets 9 800, treasury gets 200 on a 10 000 release; record stays at `amount = 10_000`. |
| `test_set_fee_bps_above_max_rejected` | `set_fee_bps(10_001)` panics with `Error(Contract, #8)`. |
| `test_set_fee_bps_rejects_uninitialized_contract` | Calling `set_fee_bps` before `initialize` panics with `Error(Contract, #10)` (`UnauthorizedAdmin`). |
| `test_set_fee_bps_updates_fee` | Round-trip 0 → 500 → 0 → 200. |
| `test_set_treasury_updates_address` | Two successive rotations land where expected. |
| `test_release_with_zero_fee_full_amount_to_planter` | `fee_bps = 0` skips the treasury transfer. |
| `test_release_with_2pct_fee_splits_correctly` | 10 000 → planter 9 800, treasury 200. |
| `test_release_with_5pct_fee` | 10 000 → planter 9 500, treasury 500. |
| `test_release_with_100pct_fee_pays_treasury_only` | 10 000 → planter 0, treasury 10 000. |
| `test_refund_is_unaffected_by_fee` | 200 bps fee + sponsor refund 91+ days later: sponsor receives 100 %; treasury receives 0. |
| `test_set_fee_bps_zero_disables_fee` | Setting to `0` mid-flight genuinely skips the next release. |
| `test_double_initialize_rejected` | Second `initialize` panics with `Error(Contract, #1)`. |

The original test bodies (`test_deposit_stores_record`, `test_release_transfers_to_planter`, `test_refund_after_90_days_returns_to_sponsor`, etc.) are preserved with `setup()` rewritten to call `initialize(fee_bps = 0)` so the conservative legacy assertions (e.g. planter receives the full `10_000`) keep holding.

---

## Implementation Details

### 1. Role separation (security)

Splitting governance from release authority is **deliberate**. The verifier is
the oracle that calls `release()` repeatedly during normal operation; if its
key is ever compromised it must **not** be able to redirect platform fees
to an attacker-controlled address. We do this by introducing an `ADMIN`
address and gating `set_fee_bps` / `set_treasury` behind it:

```rust
fn require_admin(env: &Env) {
    let admin: Address = env.storage().instance()
        .get(&symbol_short!("ADMIN"))
        .unwrap_or_else(|| panic_with_error!(env, EscrowError::UnauthorizedAdmin));
    admin.require_auth();
}
```

The verifier (`VERIFIER`) key is reused **unchanged** for `release()` so #402
verifier-gating is preserved.

### 2. Backwards-compatible event shape

The `FundsRel(tree_id)` event **topology** and **data tuple** are unchanged:

```text
FundsRel(tree_id) -> (planter: Address, planter_amount: i128)
```

`planter_amount` is now the **net** (`total - fee`), but downstream parsers
that already use those two fields keep their code paths. A brand-new event
`FeeColl(tree_id)` carries the fee leg:

```text
FeeColl(tree_id) -> (treasury: Address, fee: i128, fee_bps: u32)
```

Listeners can recover the **gross** as `planter_amount + fee`, the **fee
rate** via `fee_bps`, and the **effective treasury** address.

### 3. Overflow-safe arithmetic

Per-#432 audit guidance the contract uses `checked_mul` / `checked_div` /
`checked_sub` for every multiplication:

```rust
let fee = record.amount
    .checked_mul(fee_bps as i128).expect("fee calculation overflow")
    .checked_div(BPS_DENOM).expect("fee division error");
let planter_amount = record.amount.checked_sub(fee).expect("planter amount underflow");
```

Computing `planter_amount` as `amount - fee` (rather than
`amount * (10_000 - bps) / 10_000`) avoids double-rounding that could
trap fractional tokens inside the contract.

### 4. Zero-fee fast path

When `fee == 0` we skip the treasury `transfer` call entirely (a no-op
would still cost the caller a fee budget). `FeeColl` is also suppressed
in that case. This makes fee *deactivation* (e.g. for a promotional
period) both correct and cheap.

### 5. Refund ignores the fee

`refund(tree_id)` is unchanged. After 90 days the sponsor receives the
**full** deposit; no fee is collected on the way back. This matches the
contract's promise to the sponsor ("held in escrow until release or
refund").

### 6. Storage layout (instance)

| Key | Type | Purpose |
| --- | --- | --- |
| `ADMIN` | `Address` | Governance for fee/treasury rotation. |
| `VERIFIER` | `Address` | Authority to call `release()` (existing). |
| `TREASURY` | `Address` | Recipient of every released fee. |
| `FEE_BPS` | `u32` | Current platform fee, 0 ≤ bps ≤ 10 000. |

---

## Breaking Changes

| API | Before | After | Migration |
| --- | --- | --- | --- |
| `initialize(verifier)` | 1 argument | 4 arguments `(admin, verifier, treasury, fee_bps)` | Pass the new addresses. Recommended: `fee_bps = 200`. |

There are **no event breaking changes** and **no on-chain migration**
required — the contract is freshly initialized on upgrade. Refund and
deposit flows are byte-compatible (same argument list, same return
values, same event names).

---

## How to Test

```bash
cd contracts
cargo test -p escrow
```

Expected:

```text
running 27 tests
...
test result: ok. 27 passed; 0 failed; 0 ignored; 0 measured
```

Manual end-to-end on testnet:

```bash
# 1. Deploy
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow.wasm \
  --source $ADMIN_SECRET \
  --network testnet

# 2. Initialise with a 2 % fee routed at the multisig treasury
stellar contract invoke \
  --id $ESCROW_ID --source $ADMIN_SECRET --network testnet \
  -- initialize \
    --admin $MULTISIG_ADDR \
    --verifier $VERIFIER_ADDR \
    --treasury $TREASURY_ADDR \
    --fee_bps 200

# 3. Sponsor a tree
stellar contract invoke \
  --id $ESCROW_ID --source $SPONSOR_SECRET --network testnet \
  -- deposit --sponsor $SPONSOR_ADDR --planter $PLANTER_ADDR \
  --tree_id 1 --token $USDC_ADDR --amount 1000000

# 4. Verifier releases → planter gets 980 000, treasury gets 20 000
stellar contract invoke \
  --id $ESCROW_ID --source $VERIFIER_SECRET --network testnet \
  -- release --tree_id 1

# 5. Inspect storage
stellar contract invoke \
  --id $ESCROW_ID --source $ADMIN_SECRET --network testnet -- get_fee_bps
# → 200
stellar contract invoke \
  --id $ESCROW_ID --source $ADMIN_SECRET --network testnet -- get_treasury
# → $TREASURY_ADDR
```

---

## Security Considerations

| Concern | Mitigation |
| --- | --- |
| Compromised verifier redirecting fees | ADMIN is a separate role; verifier can only call `release()`. |
| Fee > 100 % (would over-deduct) | `MAX_FEE_BPS = 10_000` enforced in both `initialize` and `set_fee_bps`. |
| Arithmetic overflow | `checked_mul` / `checked_div` / `checked_sub` on every amount computation. |
| Dust trapped in escrow | `planter_amount = amount - fee` (subtraction, not re-divided). |
| Fee charged on refund | Explicitly verified by `test_refund_is_unaffected_by_fee`; `refund()` is fee-agnostic. |
| Misconfigured treasury | `PlatformFeeTreasuryNotSet` panic, surfaced as event error before any transfer. |

---

## Files Changed

- `contracts/escrow/src/lib.rs` — full implementation + 14 new tests.

No other contracts, scripts, or front-end code need to change for this
PR. Future PRs may layer the same fee model onto
`contracts/donation-escrow`, `contracts/escrow-milestone`, and
`contracts/tree-escrow` — but that is **out of scope** for #467.

---

## Checklist

- [x] My code follows the atomic commit convention.
- [x] Each commit message follows Conventional Commits (`feat:`, `fix:`, etc.).
- [x] Self-review of all changes.
- [x] `cargo test -p escrow` passes (27 tests).
- [x] `cargo clippy -p escrow -- -D warnings` clean.
- [x] No new warnings under `cargo build -p escrow --release`.
- [x] Documentation updated (module-level doc-comment inside `lib.rs`).
- [x] No UI changes — N/A.
- [x] Backwards compatibility notes added (event shape preserved; only `initialize` is breaking and is documented).

---

## Out of Scope (Follow-ups)

- Repeat the platform fee design on the other escrow contracts
  (`donation-escrow`, `escrow-milestone`, `tree-escrow`) once #467 is
  merged.
- Front-end: surface "platform fee" breakdown on the sponsor view
  using the new `FeeColl` event stream.
- Treasury withdrawal flow already exists in `contracts/treasury`;
  wire the multisig signers to the deployment script for this
  contract.
