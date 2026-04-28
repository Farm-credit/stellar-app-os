# TREE Token — Carbon Offset Asset

**1 TREE = 1 verified tree planted = 48 kg CO₂ offset over its lifetime**

## Overview

TREE is a custom Stellar asset representing verified carbon offsets from tree planting. Each token is minted by the tree-escrow smart contract when a farmer's planting is verified with GPS + photo proof.

## Testnet Deployment

| Property | Value |
|----------|-------|
| **Asset Code** | `TREE` |
| **Network** | Stellar Testnet |
| **Issuer** | `GA5WBQTSUOCBCNI4GNX7RKN75F5RNUR25KJXADQ7VBCKHTKPDVU4R27S` |
| **Distributor** | `GDB7XVIR7YF5QEPL5N7ZVGBLGETUOTZS46MPM32SYNIWZNYXCKYZDVLG` |
| **Total Supply** | 1,000,000,000 TREE |
| **Issuer Status** | Locked (master weight = 0) |
| **CO₂ Offset** | 48 kg per TREE |
| **Explorer** | [View on Stellar Expert](https://stellar.expert/explorer/testnet/asset/TREE-GA5WBQTSUOCBCNI4GNX7RKN75F5RNUR25KJXADQ7VBCKHTKPDVU4R27S) |

### Deployment Transactions

1. **Trustline**: Distributor opens trustline for TREE
2. **Mint**: Issuer sends 1B TREE to distributor
   - Hash: `130d1a389d746bd91b164260ecf7c59de92527a5c915f4f7a8480183df345da4`
3. **Lock**: Issuer master weight set to 0 (no further issuance)
   - Hash: `e93af39c61d263ad150e0f26798fe0401913b4c345dbf1c1107eb0238a618ffe`

## Carbon Offset Calculation

Based on project constants:
- `TREES_PER_DOLLAR = 1`
- `CO2_PER_DOLLAR = 0.048` tonnes = **48 kg**

Each tree sequesters approximately **48 kg of CO₂** over its ~25-year lifetime.

## Minting Flow

```
Donor donates → Escrow funded → Farmer plants → Admin verifies planting
                                                        ↓
                                            tree-escrow.verify_planting()
                                                        ↓
                                            StellarAssetClient::mint(&donor, 1)
                                                        ↓
                                            Donor receives 1 TREE token
```

The tree-escrow Soroban contract is the only entity authorized to mint TREE tokens. It mints 1 TREE to the donor's wallet address (stored in the escrow record) when `verify_planting()` is called by the admin after validating GPS + photo proof.

## Integration

### TypeScript

```typescript
import { getTreeAsset, CO2_KG_PER_TREE } from '@/lib/stellar/tree-asset';

const treeAsset = getTreeAsset('testnet');
// Asset { code: 'TREE', issuer: 'GA5W...' }

const offsetKg = 10 * CO2_KG_PER_TREE; // 480 kg CO₂ for 10 TREE
```

### Soroban Contract

The tree-escrow contract must be initialized with the TREE token address:

```rust
client.initialize(&admin, &tree_token_address);
```

When deploying the escrow contract, the TREE `StellarAssetContract` must be deployed with the escrow contract's address as its admin, granting mint authority.

## Mainnet Deployment

**Status**: Not yet deployed

When deploying to mainnet:
1. Run `node scripts/deploy-tree-asset.mjs` with mainnet config
2. Update `TREE_ISSUER_MAINNET` in `lib/stellar/tree-asset.ts`
3. Update this document with mainnet addresses

## Security

- **Issuer locked**: Master weight = 0 prevents unauthorized minting
- **Minting authority**: Only the tree-escrow contract can mint via SAC admin interface
- **Verification required**: Minting only occurs after admin validates GPS + photo proof
- **Immutable supply cap**: 1B TREE hard cap enforced by locked issuer

## References

- [Stellar Custom Assets](https://developers.stellar.org/docs/issuing-assets/anatomy-of-an-asset)
- [Soroban Token Interface](https://soroban.stellar.org/docs/reference/interfaces/token-interface)
- [Tree Escrow Contract](../../contracts/tree-escrow/src/lib.rs)
