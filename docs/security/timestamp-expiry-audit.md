# Job-expiry timestamp manipulation audit

**Issue:** #1026  
**Scope:** `contracts/planting-bond/src/lib.rs`  
**Status:** Remediated for abandonment/slashing eligibility

## Finding

The original `PlantingBond::slash_bond` implementation calculated the seven-day abandonment window from `env.ledger().timestamp()` and the stored `accepted_at` value. Stellar documents ledger close time as a UNIX timestamp whose accuracy depends on the proposing validator's system clock; the network may confirm a close time that lags by a few seconds or is up to 60 seconds ahead, although it remains strictly monotonic [1]. That makes close time suitable for audit/display metadata but not ideal as the sole security boundary for a deadline where an early or late transition changes who receives funds.

This is distinct from Soroban authorization expiry. Auth-entry signatures are bounded by a ledger number, not a timestamp, and Stellar recommends keeping those windows short [2]. Storage TTL is also not a business deadline: the Soroban storage guidance states that anyone may extend an entry's TTL, so a contract must keep a business deadline in the value and enforce it in code [3].

## Remediation

`Bond` now records both values:

| Field | Purpose | Security role |
|---|---|---|
| `accepted_at` | Preserve the ledger close time for UI, event correlation, and audit trails. | Informational only. |
| `accepted_ledger` | Record the ledger sequence at job acceptance. | Used for abandonment eligibility. |

`slash_bond` now permits slashing only when the current ledger sequence reaches `accepted_ledger + ABANDON_DEADLINE_LEDGERS`. The seven-day policy is represented conservatively as `(7 * 24 * 60 * 60 / 5) + 1` ledgers using the nominal five-second cadence. The additional ledger prevents an exact-boundary rounding decision from becoming an early expiry. Arithmetic uses saturating addition so a corrupted or extreme sequence value cannot wrap the deadline backwards.

This removes validator close-time skew from the authorization decision. It does not claim that a ledger is exactly five seconds: ledger cadence can vary, so the policy is a conservative ledger-window approximation. If the product requires an exact wall-clock SLA, the protocol should instead accept an explicit governance-controlled deadline or an oracle policy and document that trade-off; it should not silently reintroduce a raw timestamp comparison.

## Verification

The test suite now advances `sequence_number` for both sides of the deadline boundary. The pre-deadline test remains rejected, and the post-window test releases the bond to the treasury. Library compilation passes in an isolated crate workspace with the repository's Soroban SDK dependency. The package's test build is currently blocked by a pre-existing dependency-resolution incompatibility between `soroban-env-host` and `ed25519-dalek` in the sandbox toolchain; the contract source itself compiles successfully.

## Residual controls and review checklist

| Control | Result |
|---|---|
| Deadline stored in contract state | Pass: `accepted_ledger` is part of `Bond`. |
| Deadline enforced in contract code | Pass: `slash_bond` compares ledger sequence. |
| Storage TTL treated as a security boundary | Pass: no expiry decision uses TTL. |
| Close timestamp used for authorization | Fail by design: timestamp retained only as metadata. |
| Boundary and overflow behavior tested | Pass: before-window and after-window paths use ledger sequence; deadline addition saturates. |
| Exact wall-clock duration guaranteed | Not claimed: ledger cadence is approximate and documented. |

## References

[1]: https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/ledgers "Stellar Docs — Ledgers"

[2]: https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations "Stellar Docs — Signing Soroban contract invocations"

[3]: https://developers.stellar.org/docs/build/guides/storage/storage-strategies "Stellar Docs — Storage strategies in production contracts"
