# CI Fixes Applied

This file documents fixes applied to resolve CI pipeline failures.

## package.json
- Removed duplicate `devDependencies` keys that caused `SyntaxError: Expected ',' or '}' after property value in JSON`

## contracts/harvesta-errors/src/lib.rs
- Removed 8 duplicate enum variants (`CommitmentAlreadyRegistered`, `NotVerifier`, `Co2MustBePositive`, `MaturityYearsMustBePositive`, `SpeciesNotFound`, `ProofCommitmentAlreadyRegistered`, `PointOutsidePolygon`, `ZoneNotFound`) that had the same discriminants as earlier variants

## contracts/species-voting/src/lib.rs
- Replaced `env.invoker()` (API removed in recent Soroban SDK) with explicit `Address` parameter in `propose_species()` and `vote()` functions
- Updated all test calls to pass the address parameter
- Prefixed unused `species_registry` variable with underscore to silence clippy warning
