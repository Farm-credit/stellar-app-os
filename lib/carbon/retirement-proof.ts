/**
 * Carbon credit retirement receipts — Closes #1330.
 *
 * When a buyer retires credits we mint an immutable, verifiable receipt
 * containing: credits retired, project details, co-benefits achieved, and
 * the timestamp — anchored to a Stellar transaction hash.
 *
 * Immutability model:
 * 1. The receipt is serialized to *canonical* JSON (sorted keys, no
 *    whitespace) so the same logical document always hashes identically.
 * 2. `receiptHash = sha256(canonicalJson)` is stored alongside the payload.
 * 3. A short digest is embedded in the on-chain transaction memo, tying the
 *    document to an immutable ledger entry.
 * 4. `verifyRetirementReceipt` recomputes the hash — any tampering with the
 *    stored payload breaks the digest, and any attempt to swap the tx hash
 *    is caught by comparing the memo against Horizon.
 */

import { createHash } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RetirementReceiptInput {
  /** Idempotency key — one receipt per retirement operation. */
  retirementKey: string;
  buyerWallet: string;
  buyerEmail?: string;
  /** Amount retired, in tonnes CO2e. */
  creditAmount: number;
  unit?: string;
  projectId: string;
  projectName: string;
  projectLocation?: string;
  projectType?: string;
  vintageYear?: number;
  /** e.g. ['biodiversity', 'rural_jobs', 'watershed_protection'] */
  coBenefits: string[];
  network: 'testnet' | 'mainnet';
  /** Stellar hash of the retirement (burn) transaction. */
  txHash: string;
  /** Memo embedded in the retirement transaction (≤28 chars). */
  onChainMemo?: string;
  /** ISO-8601 timestamp of retirement. Defaults to now. */
  retiredAt?: string;
}

export interface RetirementReceipt extends RetirementReceiptInput {
  unit: string;
  retiredAt: string;
  /** sha256 of the canonical receipt JSON. */
  receiptHash: string;
  /** Version of the receipt schema. */
  schemaVersion: 1;
}

// ── Canonical JSON ────────────────────────────────────────────────────────────

/**
 * Deterministic JSON serialization: object keys sorted recursively,
 * arrays preserved in order, numbers via their JS repr.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(',')}}`;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// ── Receipt lifecycle ─────────────────────────────────────────────────────────

/** Short on-chain memo for a receipt (Stellar text memos are ≤28 bytes). */
export function buildRetirementMemo(receiptHash: string): string {
  const memo = `ret:${receiptHash.slice(0, 24)}`;
  return memo.length <= 28 ? memo : memo.slice(0, 28);
}

/** Build an immutable receipt from retirement inputs. */
export function buildRetirementReceipt(input: RetirementReceiptInput): RetirementReceipt {
  if (input.creditAmount <= 0) {
    throw new Error('Retirement amount must be greater than zero');
  }
  if (!input.retirementKey) {
    throw new Error('retirementKey is required');
  }
  if (!input.buyerWallet) {
    throw new Error('buyerWallet is required');
  }
  if (!input.txHash) {
    throw new Error('txHash is required — a receipt must be anchored on-chain');
  }

  const receipt: RetirementReceipt = {
    ...input,
    unit: input.unit ?? 'tCO2e',
    retiredAt: input.retiredAt ?? new Date().toISOString(),
    schemaVersion: 1,
    // Placeholder — replaced after canonical hashing of the body.
    receiptHash: '',
  };

  const body = { ...receipt } as Record<string, unknown>;
  delete body.receiptHash;
  receipt.receiptHash = sha256Hex(canonicalJson(body));
  return receipt;
}

/**
 * Verify a stored receipt: the payload must hash to its own receiptHash.
 * Returns the recomputed digest so callers can also compare against the
 * on-chain memo (`ret:<first24>`).
 */
export function verifyRetirementReceipt(receipt: RetirementReceipt): {
  valid: boolean;
  recomputedHash: string;
  expectedMemo: string;
} {
  const body = { ...receipt } as Record<string, unknown>;
  delete body.receiptHash;
  const recomputedHash = sha256Hex(canonicalJson(body));
  return {
    valid: recomputedHash === receipt.receiptHash,
    recomputedHash,
    expectedMemo: buildRetirementMemo(receipt.receiptHash),
  };
}
