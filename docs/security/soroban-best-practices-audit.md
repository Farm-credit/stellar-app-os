# Stellar Soroban best-practices audit

**Issue:** #1029  
**Repository:** `Farm-credit/stellar-app-os`  
**Audit date:** 2026-08-27  
**Scope:** Every Rust package listed in `contracts/Cargo.toml`, including shared libraries and `harvesta-errors`.

## Executive summary

The audit combines a repository-wide static inventory with targeted review of the highest-risk patterns: authorization, storage lifecycle, timestamp-based business decisions, cross-contract calls, checked arithmetic, and tests. The inventory found **34 package source files**, of which **31 are contract-facing or contract-support packages** and **3 are shared/error libraries**. Most contract packages use explicit `require_auth`, persistent or instance storage, and test modules. The principal deviations are inconsistent TTL extension, timestamp use without a documented policy, unchecked arithmetic in several contracts, and repository-wide build/test hygiene gaps.

This is an engineering audit, not a formal verification or guarantee. Stellar's own security documentation cautions that following a checklist cannot guarantee security and recommends threat modeling and layered controls [1].

## Review criteria

| Criterion            | Expected practice                                                                                                                              | Evidence used                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Authorization        | Every state-changing public entry point requires the appropriate signer, with admin roles stored and checked consistently.                     | `require_auth()` and role-check scan; targeted source review. |
| Storage              | Choose `instance`, `persistent`, or `temporary` according to lifecycle; plan TTL explicitly; do not treat TTL as a business-security boundary. | Storage and `extend_ttl` scan; Soroban storage guidance [2].  |
| Time                 | Keep business deadlines in contract values and use the correct clock/ledger primitive for the threat model.                                    | `timestamp()` scan; ledger close-time guidance [3].           |
| Cross-contract calls | Apply checks-effects-interactions and protect state transitions around token or contract calls.                                                | Cross-contract call scan and targeted review.                 |
| Arithmetic           | Use checked or saturating arithmetic where inputs or counters can be attacker-influenced.                                                      | `checked_`, `saturating_`, and overflow scan.                 |
| Testing              | Maintain unit tests for authorization, boundaries, expiry, replay, and failure paths.                                                          | `#[test]` count per package and existing test modules.        |
| Operations           | Use simulations, time bounds, short auth-expiration windows, and explicit restore/TTL procedures in release tooling.                           | Repository scripts/docs and official invocation guidance [4]. |

## Repository-wide findings

### 1. Authorization is generally present, but helper packages are intentionally exempt

Most stateful application contracts contain `require_auth()` or an equivalent role check. `auth-contract`, `contract-utils`, `shared`, and `harvesta-errors` do not expose user-facing state transitions requiring direct authorization; they are helper, interface, or error packages. These are not findings by themselves, but every caller must still enforce authorization at the boundary.

### 2. TTL is unevenly managed

Soroban does not automatically extend an entry's TTL on access. Persistent and instance entries can archive, while temporary entries are deleted permanently; TTL operations are explicit and should be tested by manipulating ledger sequence numbers [2]. Packages with explicit `extend_ttl` calls include `auth-contract`, `carbon-dex`, `carbon-marketplace`, `contract-utils`, `donation-escrow`, `farmer-registry`, `kyc-attestation`, `platform-governance`, `species-catalog`, `tree-escrow`, `tree-registry`, `tree-token`, and `verifier-staking`. The remaining packages need a documented liveness policy or an explicit statement that archival/restoration is handled operationally.

The audit also confirms that TTL must not be used as a business deadline. Stellar's storage guidance states that anyone can extend an entry's TTL; deadlines that affect authorization or payout therefore belong in the stored value and must be checked by contract code [2]. Issue #1026 separately remediates the planting-bond abandonment decision by storing `accepted_ledger` and comparing ledger sequence.

### 3. Timestamp use needs a documented distinction between metadata and security decisions

Many contracts record `env.ledger().timestamp()` for audit fields, events, creation times, or update times. That is acceptable when the value is informational. It requires additional review when used to authorize release, expiry, slashing, or voting. Stellar documents ledger close time as monotonic but potentially lagging by seconds or up to 60 seconds ahead due to validator clock accuracy [3]. The audit therefore classifies timestamp use as follows:

| Usage                                                | Decision                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Audit/display fields such as created or updated time | Acceptable when not used as a security boundary.                                                                          |
| User-facing absolute deadlines                       | Acceptable only with a documented skew tolerance and conservative boundary.                                               |
| Authorization expiry                                 | Prefer the protocol's ledger-based auth-entry expiration; short windows are safer [4].                                    |
| Payout, slashing, or permission expiry               | Store and enforce a ledger-based or otherwise explicitly governed deadline in contract state; do not rely on storage TTL. |

### 4. Cross-contract calls require continued checks-effects-interactions review

Token transfers, mints, and contract clients are common across this repository. The strongest reviewed paths update status before the external call and use a reentrancy guard where a malicious callee could call back. The audit recommends retaining that pattern and adding a regression test whenever a new external call is introduced. A static call-site match cannot prove that every path is safe.

### 5. Arithmetic safety is inconsistent

Several contracts contain checked or saturating arithmetic, but the scan also found packages whose public counters or amount calculations do not visibly use those helpers. This does not prove exploitable overflow because some values are bounded before arithmetic; however, bounds should be adjacent to the operation and tested. Issue #1026's `saturating_add` deadline calculation is an example of the preferred defensive pattern.

### 6. Test coverage is broad but uneven

The inventory reports tests in most contract packages. `contract-utils` has no local test functions, while `planter-registry` and `species-registry` have only a small number relative to their public surface. The full repository currently has pre-existing syntax and dependency blockers that prevent a clean all-workspace validation; the release process should keep targeted package tests and isolated library checks available until the baseline is repaired.

## Package-by-package inventory

The following table is generated from the source files under `contracts/*/src/lib.rs`. `yes` means the pattern was found by static scan; it is a review signal, not a proof that every function complies.

| Package                     | Auth | Storage | TTL | Timestamp | External calls | Checked arithmetic | Tests | Audit disposition                                                                    |
| --------------------------- | ---: | ------: | --: | --------: | -------------: | -----------------: | ----: | ------------------------------------------------------------------------------------ |
| `admin-controls`            |  yes |     yes |  no |       yes |            yes |                 no |    16 | Review timestamp semantics and add checked arithmetic where inputs are not bounded.  |
| `aggregate-impact-verifier` |  yes |     yes |  no |       yes |            yes |                yes |    10 | Document archival policy; timestamp uses need classification.                        |
| `auth-contract`             |  no* |     yes | yes |       yes |            yes |                 no |    12 | Helper/auth implementation; verify callers enforce authorization and document TTL.   |
| `carbon-credits`            |  yes |     yes |  no |       yes |            yes |                 no |    12 | Review arithmetic and explicit TTL policy.                                           |
| `carbon-dex`                |  yes |     yes | yes |        no |            yes |                yes |    24 | Good baseline; retain price/amount boundary tests.                                   |
| `carbon-marketplace`        |  yes |     yes | yes |       yes |            yes |                yes |    64 | Good baseline; review timestamp uses and external-call ordering.                     |
| `contract-utils`            |  no* |     yes | yes |        no |             no |                 no |     0 | Helper library; add focused tests for shared storage/TTL helpers.                    |
| `donation-escrow`           |  yes |     yes | yes |       yes |            yes |                yes |    53 | Good baseline; review timestamp fields and payout boundaries.                        |
| `escrow`                    |  yes |     yes |  no |       yes |            yes |                yes |    14 | Review expiry and add an explicit archival policy.                                   |
| `escrow-milestone`          |  yes |     yes |  no |       yes |            yes |                yes |    26 | Review milestone timestamp decisions and TTL plan.                                   |
| `farmer-registry`           |  yes |     yes | yes |       yes |            yes |                yes |    52 | Good baseline; document registry TTL and timestamp roles.                            |
| `harvesta-errors`           |  no* |      no |  no |        no |             no |                yes |     0 | Error-only crate; add compile-time/error-code consistency checks if expanded.        |
| `kyc-attestation`           |  yes |     yes | yes |       yes |            yes |                 no |    19 | Review attestation expiry and arithmetic boundaries.                                 |
| `location-proof`            |  yes |     yes |  no |       yes |            yes |                yes |    18 | Review proof freshness and archival policy.                                          |
| `naira-payout`              |  yes |     yes |  no |       yes |            yes |                yes |    11 | Review payout deadline and external-call ordering.                                   |
| `nft-certificate`           |  yes |     yes |  no |       yes |            yes |                yes |    32 | Review timestamp metadata and token-call failure paths.                              |
| `nullifier-registry`        |  yes |     yes |  no |       yes |            yes |                 no |    23 | Review expiry semantics; persist explicit deadline in values.                        |
| `planter-blacklist`         |  yes |     yes |  no |       yes |            yes |                 no |    18 | Review time-based removals and add checked counters.                                 |
| `planter-registry`          |  yes |     yes | yes |       yes |            yes |                yes |     1 | Priority: increase tests for authorization, duplicate registration, and TTL.         |
| `planting-bond`             |  yes |     yes |  no |       yes |            yes |                yes |    12 | Remediated in #1026: security deadline now uses ledger sequence.                     |
| `platform-governance`       |  yes |     yes | yes |       yes |            yes |                yes |    87 | Good baseline; review all timelock boundaries and TTL renewal.                       |
| `public-seal`               |  yes |     yes |  no |       yes |            yes |                 no |    18 | Review approval expiry; ensure value deadline is authoritative.                      |
| `shared`                    |  no* |     yes |  no |        no |             no |                 no |    12 | Shared types/helpers; test callers and document storage assumptions.                 |
| `species-catalog`           |  yes |     yes | yes |       yes |            yes |                yes |    40 | Good baseline; document timestamp metadata and TTL policy.                           |
| `species-registry`          |  yes |     yes |  no |       yes |            yes |                 no |     3 | Priority: add mutation, authorization, and archival tests.                           |
| `species-voting`            |  yes |     yes |  no |       yes |            yes |                 no |     9 | Review voting deadline primitive and boundary tests.                                 |
| `sponsor-receipt`           |  yes |     yes |  no |       yes |            yes |                yes |    32 | Review receipt timestamps as metadata and arithmetic limits.                         |
| `subscription-sponsorship`  |  yes |     yes |  no |       yes |            yes |                 no |    21 | Review subscription expiry and explicit deadline checks.                             |
| `treasury`                  |  yes |     yes |  no |        no |            yes |                 no |    13 | Review checked amount arithmetic and token call ordering.                            |
| `tree-escrow`               |  yes |     yes | yes |       yes |            yes |                yes |    25 | Priority: repair existing source/build hygiene, then review milestone timestamp use. |
| `tree-registry`             |  yes |     yes | yes |       yes |            yes |                yes |    28 | Good baseline; document registry TTL and timestamp roles.                            |
| `tree-token`                |  yes |     yes | yes |       yes |            yes |                yes |    31 | Good baseline; keep deadline values separate from TTL.                               |
| `verifier-staking`          |  yes |     yes | yes |       yes |            yes |                yes |    26 | Good baseline; review appeal expiry and timestamp skew policy.                       |
| `zk-location-verifier`      |  yes |     yes | yes |       yes |            yes |                 no |    33 | Review proof freshness and storage TTL; add arithmetic bounds.                       |
| `zk-verifier`               |  yes |     yes | yes |       yes |            yes |                yes |    31 | Good baseline; review proof expiry and checked arithmetic.                           |

`no*` marks a helper package where the absence of a direct public authorization check is expected, but callers remain responsible for authorization.

## Remediation plan

| Priority | Action                                                                                                                                                        | Owner boundary                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| P0       | Keep #1026's ledger-sequence deadline remediation and add a migration plan for any already-stored `Bond` values before deployment.                            | Planting bond deployment/release process. |
| P0       | Repair the pre-existing `tree-escrow` syntax/source corruption and establish a clean workspace build before treating integration results as release evidence. | Contract maintainers.                     |
| P1       | Add explicit deadline fields and value checks to any contract where timestamps currently authorize payouts, slashing, voting, or expiry.                      | Each owning contract.                     |
| P1       | Add TTL policy comments and targeted ledger-sequence TTL tests for all persistent/instance data that must remain live.                                        | Each owning contract.                     |
| P1       | Add checked arithmetic and boundary tests around public amounts, counters, and time additions.                                                                | Each owning contract.                     |
| P2       | Add focused tests to `contract-utils`, `planter-registry`, and `species-registry`, then make the full workspace CI gate reliable.                             | Repository CI.                            |
| P2       | Require testnet harness execution and recorded `get_record` state checks before release; never treat dry-run output as a live pass.                           | Release engineering.                      |

## Validation performed

The static inventory completed across all `contracts/*/src/lib.rs` files and counted package-local `#[test]` functions. The targeted `planting-bond` library compiled successfully in an isolated workspace after the #1026 change. The repository-wide contract and TypeScript checks remain blocked by pre-existing baseline errors, including malformed `tree-escrow` source and unrelated TypeScript syntax errors; these blockers are recorded rather than hidden.

## References

[1]: https://developers.stellar.org/docs/build/security-docs 'Stellar Docs — Security Best Practices'
[2]: https://developers.stellar.org/docs/build/guides/storage/storage-strategies 'Stellar Docs — Storage strategies in production contracts'
[3]: https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/ledgers 'Stellar Docs — Ledgers'
[4]: https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations 'Stellar Docs — Signing Soroban contract invocations'
