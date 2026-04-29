/**
 * TREE Token — FarmCredit Carbon-Offset Asset
 *
 * 1 TREE token = 1 tree planted = 1 verified carbon-offset unit.
 *
 * CO2 offset methodology (Northern Nigeria savannah trees):
 *   • Growth rate  : ~2 kg CO2/tree/year (IPCC Tier 1, dryland savannah)
 *   • Horizon      : ~25-year productive lifetime
 *   • Lifetime CO2 : 48 kg CO2 per token  (conservative, Verra VCS-aligned)
 *   • Source       : CO2_PER_DOLLAR = 0.048 t ≡ 48 kg at TREES_PER_DOLLAR = 1
 *
 * Token mechanics:
 *   • TREE tokens are issued from the locked issuer account; distribution is
 *     managed by the distributor account (see docs/tree-token.md).
 *   • Each TREE is transferred from the distributor to the donor once a
 *     planting batch is verified on-chain (GPS + photo proof).
 *   • Tokens can be held as carbon-offset certificates or retired (burned)
 *     to claim the offset against a personal/corporate carbon footprint.
 *   • 1 TREE token always represents exactly 1 verified, living tree.
 *
 * Testnet deployment: docs/tree-token.md
 *
 * Re-exports the core asset helpers from tree-asset.ts for convenience.
 */

import { TransactionBuilder, Operation, BASE_FEE } from '@stellar/stellar-sdk';
import { Horizon } from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';
import {
  getTreeAsset,
  getTreeExplorerUrl,
  TREE_ISSUER_TESTNET,
  TREE_ISSUER_MAINNET,
  TREE_DISTRIBUTOR_TESTNET,
  CO2_KG_PER_TREE,
} from './tree-asset';
import { networkConfig } from '@/lib/config/network';

// ── Re-exports (consumers import from here) ───────────────────────────────────

export {
  getTreeAsset,
  getTreeExplorerUrl,
  TREE_ISSUER_TESTNET,
  TREE_ISSUER_MAINNET,
  TREE_DISTRIBUTOR_TESTNET,
  CO2_KG_PER_TREE,
};

// ── Token metadata ────────────────────────────────────────────────────────────

export const TREE_TOKEN_CODE = 'TREE' as const;

/** Total fixed supply minted at deployment — 1 billion TREE tokens */
export const TREE_TOTAL_SUPPLY = 1_000_000_000;

/** Issuer account is locked (master weight = 0) — no further issuance possible */
export const TREE_ISSUER_LOCKED = true;

/** Home domain for the TREE asset TOML file */
export const TREE_HOME_DOMAIN = 'farmcredit.xyz';

// ── CO2 offset helpers ────────────────────────────────────────────────────────

/**
 * Calculate total CO2 offset in **kilograms** for a number of TREE tokens.
 *
 * @param treeCount - Number of TREE tokens held / trees planted
 * @returns CO2 offset in kg over the 25-year credit horizon
 *
 * @example
 * calcCO2OffsetKg(10) // → 480 kg CO2
 */
export function calcCO2OffsetKg(treeCount: number): number {
  return Math.round(treeCount * CO2_KG_PER_TREE);
}

/**
 * Calculate total CO2 offset in **metric tonnes** for a number of TREE tokens.
 *
 * @example
 * calcCO2OffsetTonnes(1000) // → 48 t CO2
 */
export function calcCO2OffsetTonnes(treeCount: number): number {
  return (treeCount * CO2_KG_PER_TREE) / 1_000;
}

/**
 * Format a CO2 offset for human-readable display.
 * Values ≥ 1,000 kg are shown in tonnes.
 *
 * @example
 * formatCO2Offset(48)    // → "48 kg CO₂"
 * formatCO2Offset(1_200) // → "1.2 t CO₂"
 */
export function formatCO2Offset(kg: number): string {
  if (kg >= 1_000) {
    const tonnes = (kg / 1_000).toLocaleString('en-US', { maximumFractionDigits: 2 });
    return `${tonnes} t CO₂`;
  }
  return `${Math.round(kg).toLocaleString('en-US')} kg CO₂`;
}

/**
 * Format a TREE token count for display (whole numbers only — no fractional trees).
 *
 * @example
 * formatTreeAmount(1250) // → "1,250 TREE"
 */
export function formatTreeAmount(amount: number): string {
  return `${Math.floor(amount).toLocaleString('en-US')} TREE`;
}

// ── Minting transaction builder ───────────────────────────────────────────────

/**
 * Build a TREE token transfer transaction from the distributor account to a
 * recipient (donor or farmer wallet) after planting has been verified on-chain.
 *
 * **Who signs**: the distributor account's secret key (server-side, never exposed
 * to the browser). The returned XDR must be signed by the distributor keypair
 * before submission.
 *
 * @param distributorPublicKey - Public key of the TREE distributor account
 * @param recipientPublicKey   - Wallet address that receives the TREE tokens
 * @param treeCount            - Number of TREE tokens to transfer (= trees planted)
 * @param network              - "testnet" | "mainnet"
 * @param memo                 - Optional memo string (max 28 chars), e.g. batch ID
 *
 * @returns Unsigned transaction XDR + network passphrase ready for signing
 */
export async function buildTreeMintTransaction(
  distributorPublicKey: string,
  recipientPublicKey: string,
  treeCount: number,
  network: NetworkType,
  memo?: string
): Promise<{ transactionXdr: string; networkPassphrase: string }> {
  if (treeCount < 1) {
    throw new Error('treeCount must be at least 1');
  }
  if (treeCount > 50_000) {
    throw new Error('treeCount exceeds single-transaction limit of 50,000 TREE');
  }

  const server = new Horizon.Server(networkConfig.horizonUrl);
  const distributorAccount = await server.loadAccount(distributorPublicKey);
  const treeAsset = getTreeAsset(network);
  const networkPassphrase = networkConfig.networkPassphrase;

  const builder = new TransactionBuilder(distributorAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  }).addOperation(
    Operation.payment({
      destination: recipientPublicKey,
      asset: treeAsset,
      amount: treeCount.toFixed(7),
    })
  );

  if (memo) {
    const { Memo } = await import('@stellar/stellar-sdk');
    builder.addMemo(Memo.text(memo.slice(0, 28)));
  }

  const transaction = builder.setTimeout(300).build();

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase,
  };
}

/**
 * Build a TREE token **retirement** (burn) transaction.
 *
 * Retirement sends TREE tokens to the issuer account, which cannot spend them
 * (master weight = 0), effectively removing them from circulation and marking
 * the corresponding CO2 offset as consumed.
 *
 * @param holderPublicKey - The account burning their TREE tokens
 * @param treeCount       - Number of TREE tokens to retire
 * @param network         - "testnet" | "mainnet"
 *
 * @returns Unsigned transaction XDR ready for the holder to sign
 */
export async function buildTreeRetirementTransaction(
  holderPublicKey: string,
  treeCount: number,
  network: NetworkType
): Promise<{ transactionXdr: string; networkPassphrase: string; co2OffsetKg: number }> {
  if (treeCount < 1) {
    throw new Error('treeCount must be at least 1');
  }

  const issuer = network === 'mainnet' ? TREE_ISSUER_MAINNET : TREE_ISSUER_TESTNET;
  if (!issuer) {
    throw new Error('TREE issuer not configured for this network');
  }

  const server = new Horizon.Server(networkConfig.horizonUrl);
  const holderAccount = await server.loadAccount(holderPublicKey);
  const treeAsset = getTreeAsset(network);
  const networkPassphrase = networkConfig.networkPassphrase;
  const { Memo } = await import('@stellar/stellar-sdk');

  const transaction = new TransactionBuilder(holderAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        // Sending to the locked issuer = permanent retirement
        destination: issuer,
        asset: treeAsset,
        amount: treeCount.toFixed(7),
      })
    )
    .addMemo(Memo.text(`retire:${treeCount}`))
    .setTimeout(300)
    .build();

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase,
    co2OffsetKg: calcCO2OffsetKg(treeCount),
  };
}
