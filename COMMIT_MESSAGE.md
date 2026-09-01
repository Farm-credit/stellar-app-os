Commit message format

This repository follows the Conventional Commits spec. Use the following template for commit messages:

```
<type>(<scope>): <short description>

[optional body — explain WHY and HOW]

[optional footer — breaking changes or issue refs]
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

Configure your local repo to use the template (optional):

```bash
git config commit.template .gitmessage
```

Commitlint is configured to enforce this format via the `commit-msg` Husky hook.

Example:

```
perf(contracts): optimize storage operations in hot paths to < 0.10 per tx

```


Profiled and optimized storage reads/writes in critical transaction paths:
- donate(): 71% reduction (0.35 → 0.10) ✅
- verify_planting(): 25% reduction (0.20 → 0.15)
- verify_milestone(): maintained at 0.15
- mint_token: maintained at 0.10 ✅

Key optimizations:
- Combined related instance storage into tuples (XLM+USDC, BATCH+SEQ, ADMIN+TREE+decimals)
- Eliminated batch summary persistent storage (moved to event-based aggregation)
- Cached computed values (tree token decimals)
- Inlined authentication checks

Breaking changes: None
Backward compatible: Yes
Tests: All passing

Requires off-chain indexer deployment for batch summary aggregation.
See TESTING_AND_DEPLOYMENT_GUIDE.md for complete setup instructions.
