# TREE Token — Testnet Deployment

## Overview

The **TREE** token is FarmCredit's on-chain carbon-offset certificate on the
Stellar network. Each token represents one verified, living tree planted in
Northern Nigeria.

```
1 TREE = 1 tree planted = 48 kg CO₂ offset over the tree's lifetime
```

---

## Testnet Deployment

### Issuing Account

| Field         | Value |
|---------------|-------|
| **Public Key**    | `GA5WBQTSUOCBCNI4GNX7RKN75F5RNUR25KJXADQ7VBCKHTKPDVU4R27S` |
| **Network**       | Stellar Testnet |
| **Master Weight** | **0** (locked — no further issuance possible) |
| **Stellar Expert**| [View issuer](https://stellar.expert/explorer/testnet/account/GA5WBQTSUOCBCNI4GNX7RKN75F5RNUR25KJXADQ7VBCKHTKPDVU4R27S) |

> ⚠️ The issuer's secret key should **never** be committed to the repository.
> Store it in a hardware wallet or secrets manager. Because the master weight
> is set to 0, losing the key does not unlock new issuance — it is permanently
> locked.

### Distribution Account

| Field         | Value |
|---------------|-------|
| **Public Key**    | `GDB7XVIR7YF5QEPL5N7ZVGBLGETUOTZS46MPM32SYNIWZNYXCKYZDVLG` |
| **Role**          | Holds full circulating supply; transfers TREE to farmers/donors post-verification |
| **Stellar Expert**| [View distributor](https://stellar.expert/explorer/testnet/account/GDB7XVIR7YF5QEPL5N7ZVGBLGETUOTZS46MPM32SYNIWZNYXCKYZDVLG) |

### Asset

| Field         | Value |
|---------------|-------|
| **Asset Code** | `TREE` |
| **Total Supply** | 1,000,000,000 TREE (fixed — issuer locked) |
| **Stellar Expert** | [View asset](https://stellar.expert/explorer/testnet/asset/TREE-GA5WBQTSUOCBCNI4GNX7RKN75F5RNUR25KJXADQ7VBCKHTKPDVU4R27S) |

---

## CO₂ Offset Methodology

| Parameter | Value | Source |
|-----------|-------|--------|
| CO₂ absorbed per tree per year | ~2 kg | IPCC AR6, Tier 1 dryland savannah |
| Credit horizon (permanence) | 25 years | Verra VCS standard |
| **Lifetime CO₂ per TREE** | **48 kg** | 2 kg × 25 yr (conservative) |
| Project region | Northern Nigeria (9°N–14°N) | GPS geohash `s0`–`s8` |

The 48 kg figure is conservative and consistent with the platform's
donation constants (`CO2_PER_DOLLAR = 0.048 t = 48 kg` at `TREES_PER_DOLLAR = 1`).
It accounts for:
- Northern Nigeria savannah growth rates (lower than tropical rainforest)
- Early-year sapling period (years 1–3, minimal CO₂ absorption)
- 10% mortality discount already accounted for by the 30% replanting buffer fund

---

## Token Lifecycle

```
Donor sends USDC
       │
       ▼
  DonationEscrow (Soroban)
  Locks funds per planting batch
       │
       ▼
  ZkLocationVerifier confirms
  GPS commitment is within
  Northern Nigeria boundary
       │
       ▼
  Admin calls approve_location()
       │
       ▼
  Distributor sends TREE tokens
  to donor wallet
  (buildTreeMintTransaction)
       │
       ▼
  Donor holds TREE as certificate
  — or —
  Donor calls buildTreeRetirementTransaction
  to permanently burn (retire) the offset
```

---

## Deployment Script

To redeploy on testnet (e.g. after testnet reset):

```bash
node scripts/deploy-tree-asset.mjs
```

The script will:
1. Generate fresh issuer and distributor keypairs
2. Fund both accounts via Stellar Friendbot
3. Have the distributor open a TREE trustline
4. Mint 1,000,000,000 TREE from issuer → distributor
5. Lock the issuer (set master weight to 0)
6. Print the new keypairs and asset config

After running, update the following with the new addresses:

| File | Key |
|------|-----|
| `.env.example` | `NEXT_PUBLIC_TREE_ISSUER`, `NEXT_PUBLIC_TREE_DISTRIBUTOR` |
| `lib/stellar/tree-asset.ts` | `TREE_ISSUER_TESTNET`, `TREE_DISTRIBUTOR_TESTNET` |
| `docs/tree-token.md` | This file |

> **Never commit the secret keys.** Only public keys belong in source control.

---

## Environment Variables

```env
# .env.local (never commit this file)
NEXT_PUBLIC_TREE_ISSUER=GA5WBQTSUOCBCNI4GNX7RKN75F5RNUR25KJXADQ7VBCKHTKPDVU4R27S
NEXT_PUBLIC_TREE_DISTRIBUTOR=GDB7XVIR7YF5QEPL5N7ZVGBLGETUOTZS46MPM32SYNIWZNYXCKYZDVLG

# Secret keys — stored in secrets manager, never in repo
TREE_ISSUER_SECRET=<secret>        # Only needed for initial deploy; account now locked
TREE_DISTRIBUTOR_SECRET=<secret>   # Required by the mint server to sign TREE transfers
```

---

## Integration Points

| Module | Description |
|--------|-------------|
| `lib/stellar/tree-asset.ts` | Core `Asset` object + Stellar Expert URL |
| `lib/stellar/tree-token.ts` | CO₂ helpers, `buildTreeMintTransaction`, `buildTreeRetirementTransaction` |
| `lib/config/network.ts` | Reads `NEXT_PUBLIC_TREE_ISSUER` from env |
| `lib/stellar/transaction.ts` | Re-exports `getTreeAsset`; payment flow |
| `scripts/deploy-tree-asset.mjs` | One-shot testnet deployment script |
| `contracts/tree-escrow/` | Soroban escrow that locks donor funds until planting verified |
| `contracts/zk-location-verifier/` | Verifies GPS commitment is within Northern Nigeria boundary |

---

## Mainnet Deployment

The mainnet issuer address is not yet configured (`TREE_ISSUER_MAINNET = ''`).
Before mainnet launch:

1. Run `scripts/deploy-tree-asset.mjs` targeting mainnet Horizon
2. Perform a Stellar Anchor review / submit asset to the Stellar TOML directory
3. Update `TREE_ISSUER_MAINNET` in `lib/stellar/tree-asset.ts`
4. Update `.env.example` with mainnet addresses
5. Update this document
