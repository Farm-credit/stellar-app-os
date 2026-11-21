# Escrow Release Front-Running Audit

## Scope

This review covers the `contracts/escrow` release path, including `release(tree_id)`, the new `batch_release(tree_ids)` entry point, verifier authorization, settlement ordering, and the public events emitted by settlement.

## Threat model

A transaction observer or relayer may see a pending release transaction before it is included. The observer is assumed to control its own account and transaction fees, but not the configured verifier’s authorization key. The observer may submit competing transactions, reorder its own transactions, or attempt to replay a previously observed call.

## Findings

| ID | Vector | Impact | Status |
|---|---|---|---|
| F-01 | Unauthorized observer copies `release(tree_id)` from the transaction pool. | No fund loss: the contract requires the configured verifier’s authorization, so the observer cannot satisfy the authorization requirement. | Mitigated by existing verifier authorization. |
| F-02 | Repeated release submissions race to settle the same escrow. | No double payment: only `Pending` records can settle; the first successful settlement changes the status and later calls revert. | Mitigated by status transition. |
| F-03 | A relayer exposes the order and timing of several independent releases. | Potential operational MEV around timing and monitoring, but not a privilege escalation or direct unauthorized payout. | Reduced by atomic `batch_release`. |
| F-04 | A batch contains an invalid or already-settled identifier. | Partial settlement could create confusing operational state if failures were swallowed. | Mitigated: the batch fails atomically and no partial batch is committed. |
| F-05 | An oversized batch exhausts resource limits. | Denial of service against the submitting transaction or unpredictable fee requirements. | Mitigated by a maximum batch size of 64. |

## Implemented mitigation

`batch_release(tree_ids)` authenticates the verifier once, validates a non-empty list with at most 64 identifiers, and calls the same internal settlement routine for every identifier. Soroban transaction atomicity means any failure reverts the entire batch. The verifier’s authorization covers the complete ordered vector, so a third party cannot append, remove, or replace identifiers without invalidating the signed invocation.

Each escrow still performs its own pending-state check, fee calculation, token transfers, status transition, workload update, and `FundsRel`/`FeeColl` events. The batch emits a final `BatchRel` event containing the number of settled records and ledger timestamp for indexers.

## Residual risks and operational controls

The mechanism does not hide transaction contents from observers and cannot prevent a verifier key compromise. Deployments should protect the verifier with a multisignature or policy-controlled signer, use a bounded transaction time window, and submit batches through reliable infrastructure. If release ordering itself becomes economically sensitive, the verifier service should construct batches according to a deterministic policy and avoid accepting untrusted caller-supplied lists.

The contract does not use a commit-reveal scheme because release authority is already cryptographically restricted and the payout destination is fixed in the escrow record. A commit-reveal flow would add storage, expiry, and liveness complexity without preventing a compromised verifier from authorizing a release.

## Verification

The integration tests in `contracts/escrow/tests/batch_release.rs` verify that multiple escrows settle in one batch and that an empty batch is rejected. The targeted test command is:

```text
cargo test -p escrow --test batch_release
```
