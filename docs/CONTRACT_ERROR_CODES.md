# Soroban contract error-code standard (issue #1813)

Every `#[contracterror]` enum in `contracts/` draws its integer codes from a
block reserved for its crate in [`contracts/error-code-ranges.json`](../contracts/error-code-ranges.json).
A code seen on the wire (`Error(Contract, #4103)`) therefore identifies both the
contract and the failure, and two contracts can never reuse a number.

## Rules

1. Each crate owns one block of 100 codes (`1000 + 100 * index`, crates in
   alphabetical order at the time of assignment). New crates take the next free block;
   existing blocks are never reassigned.
2. Codes inside an enum are unique, non-zero and fall inside the crate's block.
   Write them as literal discriminants (`NotAdmin = 4101`) so they are greppable.
3. Never renumber a released code. Add new variants at the end of the block.
4. Messages for the frontend are keyed by code; the helper
   `lib/stellar/contract-errors.ts` resolves a code to its contract and number.

## Checking

```bash
pnpm check:contract-errors      # node scripts/check-error-codes.mjs
node scripts/check-error-codes.mjs --list   # every enum with its code span
```

CI runs the check in `.github/workflows/contracts.yml`.

## Migration status

Migrated: `carbon-fractionalization` (1700-1799), `impact-plot-shares` (3100-3199),
`platform-governance` (4100-4199).

All other crates are listed under `"legacy"` in the registry. They keep their
original codes, which collide across contracts, and are only checked for
duplicates within an enum (reported as warnings). Migrating a crate means
offsetting its codes into its block, updating any `Error(Contract, #N)` literals
in its tests and in off-chain code, and removing it from `"legacy"`.

Known problem found while building the check: `contracts/escrow` currently has
duplicate discriminants in `EscrowError` and does not compile on `main`
(unresolved merge leftovers), so it needs repair before it can be migrated.
