/**
 * Classifies a Horizon transaction record into one of the FarmCredit event types.
 *
 * Classification rules (checked in priority order):
 *
 *  token_mint      — ChangeTrust or ManageAsset op on the CARBON asset issuer account
 *  escrow_deposit  — memo starts with "escrow:deposit"
 *  escrow_planting — memo starts with "escrow:plant"
 *  escrow_survival — memo starts with "escrow:survive"
 *  escrow_refund   — memo starts with "escrow:refund"
 *  donation        — payment to the known planting address with USDC, or memo starts with "donate:"
 *  other           — everything else
 */

import type { NetworkType } from '@/lib/types/wallet';

export type TxType =
  | 'donation'
  | 'escrow_deposit'
  | 'escrow_planting'
  | 'escrow_survival'
  | 'escrow_refund'
  | 'token_mint'
  | 'other';

// Known addresses — kept in sync with lib/stellar/transaction.ts
const PLANTING_ADDRESS = 'GABEMKJNR4GK7M4FROGA7I7PG63N2CKE3EGDSBSISG56SVL2O3KRNDXA';
const REPLANTING_BUFFER = 'GBUQWP3BOUZX34TOND2QV7QQ7K7VJTG6VSE62MFPXXXIAGKZ6YTDCXI';

const CARBON_ISSUER_TESTNET = 'GDUKMGUGDORQJH6YWY4RHDE6GV3NCYCBN3MORXYL43TSJPCCZFLNOA5H';
const CARBON_ISSUER_MAINNET = 'GDUKMGUGDORQJH6YWY4RHDE6GV3NCYCBN3MORXYL43TSJPCCZFLNOA5H';

export interface ClassifiedTx {
  txType: TxType;
  assetCode: string | null;
  assetIssuer: string | null;
  amount: string | null;
  destination: string | null;
  memo: string | null;
}

// Horizon operation shape (minimal — only fields we need)
interface HorizonOp {
  type: string;
  asset_code?: string;
  asset_issuer?: string;
  amount?: string;
  to?: string;
  trustor?: string;
}

interface HorizonTx {
  source_account: string;
  memo_type?: string;
  memo?: string;
  // operations are fetched separately; we accept them as a parameter
}

export function classifyTransaction(
  tx: HorizonTx,
  ops: HorizonOp[],
  network: NetworkType
): ClassifiedTx {
  const carbonIssuer = network === 'mainnet' ? CARBON_ISSUER_MAINNET : CARBON_ISSUER_TESTNET;

  const memo = tx.memo_type === 'text' ? (tx.memo ?? null) : null;

  // ── 1. Token mint: source is the carbon issuer and op is payment/changeTrust ──
  if (
    tx.source_account === carbonIssuer ||
    ops.some(
      (op) =>
        (op.type === 'change_trust' || op.type === 'payment') &&
        op.asset_issuer === carbonIssuer &&
        op.asset_code === 'CARBON'
    )
  ) {
    const op = ops.find((o) => o.asset_code === 'CARBON') ?? ops[0];
    return {
      txType: 'token_mint',
      assetCode: op?.asset_code ?? 'CARBON',
      assetIssuer: op?.asset_issuer ?? carbonIssuer,
      amount: op?.amount ?? null,
      destination: op?.to ?? null,
      memo,
    };
  }

  // ── 2. Memo-based escrow classification ──────────────────────────────────
  if (memo) {
    const m = memo.toLowerCase();
    if (m.startsWith('escrow:deposit')) return makeEscrow('escrow_deposit', ops, memo);
    if (m.startsWith('escrow:plant')) return makeEscrow('escrow_planting', ops, memo);
    if (m.startsWith('escrow:survive')) return makeEscrow('escrow_survival', ops, memo);
    if (m.startsWith('escrow:refund')) return makeEscrow('escrow_refund', ops, memo);
  }

  // ── 3. Donation: payment to planting or buffer address ───────────────────
  const donationOp = ops.find(
    (op) => op.type === 'payment' && (op.to === PLANTING_ADDRESS || op.to === REPLANTING_BUFFER)
  );
  if (donationOp || (memo && memo.toLowerCase().startsWith('donate:'))) {
    const op = donationOp ?? ops.find((o) => o.type === 'payment') ?? ops[0];
    return {
      txType: 'donation',
      assetCode: op?.asset_code ?? null,
      assetIssuer: op?.asset_issuer ?? null,
      amount: op?.amount ?? null,
      destination: op?.to ?? null,
      memo,
    };
  }

  // ── 4. Fallback ───────────────────────────────────────────────────────────
  const firstOp = ops[0];
  return {
    txType: 'other',
    assetCode: firstOp?.asset_code ?? null,
    assetIssuer: firstOp?.asset_issuer ?? null,
    amount: firstOp?.amount ?? null,
    destination: firstOp?.to ?? null,
    memo,
  };
}

function makeEscrow(txType: TxType, ops: HorizonOp[], memo: string): ClassifiedTx {
  const op = ops.find((o) => o.type === 'payment') ?? ops[0];
  return {
    txType,
    assetCode: op?.asset_code ?? null,
    assetIssuer: op?.asset_issuer ?? null,
    amount: op?.amount ?? null,
    destination: op?.to ?? null,
    memo,
  };
}
