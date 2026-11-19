# Fractionalized Impact Certificates for Micro-Benefactors

Status: **implemented** — issue [#1808](https://github.com/Farm-credit/stellar-app-os/issues/1808)

Contract: [`contracts/impact-certificate-fractionalization`](../../contracts/impact-certificate-fractionalization)

## Purpose

Non-corporate micro-benefactors can pool small contributions for a verified
community agroforestry plot and receive fractional NFT-style certificates whose
share counts are proportional to what each benefactor paid. The pooled payment
token is released to the plot steward only when the verifier mints the shares.

This complements (without changing) the existing `community-offset-pool` and
`carbon-fractionalization` contracts: the former distributes a fungible credit
token, the latter sells whole tonnes of a carbon block. This contract mints
plot-backed fractional certificates and keeps an explicit ownership record per
certificate.

## Roles

| Role | Capability |
| --- | --- |
| admin | initializes the contract, manages verifiers, may act on any plot |
| verifier | registers plots, pauses contributions, cancels plots, mints shares for its own plots |
| steward | receives the pooled funds when shares are minted |
| benefactor | contributes up to `MAX_MICRO_CONTRIBUTION` per payment and receives a certificate |

## Lifecycle

```
register_plot -> Open -> contribute... -> Funded -> mint_shares -> Minted
                  |                         |
                  +-- cancel -------------->+-- refund (grace period)
```

1. `register_plot(verifier, params)` records the plot, its steward, its payment
   token, the total number of fractional shares, the price per share and a
   contribution deadline. The target is `total_shares * share_price`.
2. `contribute(benefactor, plot_id, amount)` escrows the payment token in the
   contract. Contributions from the same wallet accumulate; the last
   contribution that reaches the target flips the plot to `Funded`.
3. `mint_shares(verifier, plot_id)` mints one certificate per non-refunded
   benefactor, transfers the pooled funds to the steward and marks the plot
   `Minted`. The last certificate receives the integer-division remainder so
   the minted shares always sum to `total_shares`.
4. If the deadline passes before the target is reached, or a plot is cancelled,
   or a funded plot is left un-minted past `REFUND_GRACE_SECONDS`, beneficiaries
   can call `refund` and reclaim their exact contribution. Minted plots can
   never be refunded.

`transfer_shares` moves part (or all) of a certificate to another address. If
the receiver already holds a certificate for the same plot, the shares are
merged into it; otherwise a new certificate id is created.

## Views and client states

| View | Purpose |
| --- | --- |
| `get_plot` | full plot record including `status` and `active` flags |
| `get_contribution` | amount deposited by a benefactor and refund flag |
| `preview_shares` | shares a benefactor would receive at the current funding level |
| `funding_progress_bps` | funding progress in basis points, capped at 10 000 |
| `is_refundable` | whether a refund can be called right now |
| `certificate_of` / `get_certificate` / `shares_of` | certificate lookup |
| `get_verifiers` / `is_verifier` | verifier set for UI gating |

These views let a front-end render loading, funded, minted, paused and refund
states without guessing from failed transactions.

## Limits

| Constant | Value | Reason |
| --- | --- | --- |
| `MIN_CONTRIBUTION` | 1 | smallest payment-token unit accepted |
| `MAX_MICRO_CONTRIBUTION` | 100_000_000 | keeps participation "micro" |
| `MAX_BENEFACTORS` | 100 | bounds the mint loop / gas cost |
| `MAX_TOTAL_SHARES` | 1_000_000_000 | bounds share arithmetic |
| `REFUND_GRACE_SECONDS` | 7 days | time for a verifier to mint before refunds open |

## Errors

All errors use crate block index 56 (`0x390000-0x39FFFF`) of the workspace
error-code standard, with compile-time assertions in `src/lib.rs` keeping the
literal `#[contracterror]` discriminants in sync with
`harvesta_errors::standard::global_code(56, local)`. Clients should decode the
namespace before interpreting the local code.

## Verification

```sh
cd contracts
cargo fmt -p impact-certificate-fractionalization -p harvesta-errors -- --check
cargo test --offline -p impact-certificate-fractionalization -p harvesta-errors
cargo clippy --offline -p impact-certificate-fractionalization --all-targets \
  --all-features --no-deps -- -D warnings -D clippy::all -D clippy::pedantic
```

The suite contains 24 contract tests covering funding, precision/remainder,
refunds, mint authorization, share transfers, bounds and error codes, plus the
13 `harvesta-errors` registry tests.
