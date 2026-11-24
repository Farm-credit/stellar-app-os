import {
  BPS_DENOM,
  DEFAULT_MILESTONE_GRACE_PERIOD_MS,
  VERIFIER_REWARD_BPS,
  type MilestoneFinalizationRecord,
  type MilestonePayoutSplit,
} from '@/lib/types/escrow';

const STROOPS_PER_USDC = 10_000_000;
const VERIFIER_REWARD_BPS_BIGINT = BigInt(VERIFIER_REWARD_BPS);
const BPS_DENOM_BIGINT = BigInt(BPS_DENOM);

export type MilestoneFinalizationErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'ALREADY_FINALIZED'
  | 'IN_PROGRESS'
  | 'MILESTONE_REJECTED'
  | 'MILESTONE_DISPUTED'
  | 'GRACE_PERIOD_ACTIVE'
  | 'INVALID_VERIFIER'
  | 'PAYOUT_FAILED';

export class MilestoneFinalizationError extends Error {
  readonly code: MilestoneFinalizationErrorCode;

  constructor(code: MilestoneFinalizationErrorCode, message: string) {
    super(message);
    this.name = 'MilestoneFinalizationError';
    this.code = code;
  }
}

export interface ApproveMilestoneInput {
  loanId: string;
  milestoneId?: number;
  farmerWalletAddress: string;
  approvingVerifierAddress: string;
  totalDisbursementUsdc: number;
  escrowSecretKey?: string;
  network?: 'testnet' | 'mainnet';
  approvedAt?: string;
  gracePeriodEndsAt?: string;
  gracePeriodMs?: number;
}

export interface PayoutExecutionResult {
  transactionHash: string;
  explorerUrl?: string;
}

export type MilestonePayoutExecutor = (
  record: MilestoneFinalizationRecord
) => Promise<PayoutExecutionResult>;

const finalizations = new Map<string, MilestoneFinalizationRecord>();
const inFlightKeys = new Set<string>();

function makeKey(loanId: string, milestoneId: number): string {
  return `${loanId}:${milestoneId}`;
}

function cloneRecord(record: MilestoneFinalizationRecord): MilestoneFinalizationRecord {
  return {
    ...record,
    split: { ...record.split },
  };
}

/**
 * Computes the exact 2% (200 bps) verifier reward split in integer Stellar stroops
 * (1 USDC = 10,000,000 stroops). Integer division dust remains with the farmer so
 * `farmerPayoutStroops + verifierRewardStroops === totalStroops` always holds.
 */
export function calculateVerifierRewardSplit(totalDisbursementUsdc: number): MilestonePayoutSplit {
  if (!Number.isFinite(totalDisbursementUsdc) || totalDisbursementUsdc <= 0) {
    throw new MilestoneFinalizationError(
      'INVALID_INPUT',
      'totalDisbursementUsdc must be a positive finite number'
    );
  }

  const totalStroops = BigInt(Math.round(totalDisbursementUsdc * STROOPS_PER_USDC));
  if (totalStroops <= 0n) {
    throw new MilestoneFinalizationError(
      'INVALID_INPUT',
      'totalDisbursementUsdc must equal at least 1 stroop'
    );
  }

  const verifierRewardStroops = (totalStroops * VERIFIER_REWARD_BPS_BIGINT) / BPS_DENOM_BIGINT;
  const farmerPayoutStroops = totalStroops - verifierRewardStroops;

  return {
    totalDisbursementUsdc: Number(totalStroops) / STROOPS_PER_USDC,
    verifierRewardUsdc: Number(verifierRewardStroops) / STROOPS_PER_USDC,
    farmerPayoutUsdc: Number(farmerPayoutStroops) / STROOPS_PER_USDC,
    totalStroops,
    verifierRewardStroops,
    farmerPayoutStroops,
  };
}

export function resetMilestoneFinalizations(): void {
  finalizations.clear();
  inFlightKeys.clear();
}

export function listMilestoneFinalizations(): MilestoneFinalizationRecord[] {
  return [...finalizations.values()].map(cloneRecord);
}

export function getMilestoneFinalization(
  loanId: string,
  milestoneId = 1
): MilestoneFinalizationRecord | undefined {
  const existing = finalizations.get(makeKey(loanId, milestoneId));
  return existing ? cloneRecord(existing) : undefined;
}

/**
 * Records an approving verifier's milestone attestation and starts the grace
 * period window before funds can be finalized and split.
 */
export function approveMilestoneWithGracePeriod(
  input: ApproveMilestoneInput
): MilestoneFinalizationRecord {
  const milestoneId = input.milestoneId ?? 1;
  if (!Number.isInteger(milestoneId) || milestoneId < 1) {
    throw new MilestoneFinalizationError('INVALID_INPUT', 'milestoneId must be a positive integer');
  }
  if (!input.loanId?.trim() || !input.farmerWalletAddress?.trim()) {
    throw new MilestoneFinalizationError(
      'INVALID_INPUT',
      'loanId and farmerWalletAddress are required'
    );
  }
  if (!input.approvingVerifierAddress?.trim()) {
    throw new MilestoneFinalizationError(
      'INVALID_VERIFIER',
      'approvingVerifierAddress is required to route verifier reward'
    );
  }

  const key = makeKey(input.loanId.trim(), milestoneId);
  const existing = finalizations.get(key);
  if (existing) {
    if (existing.status === 'rejected') {
      throw new MilestoneFinalizationError(
        'MILESTONE_REJECTED',
        `Milestone ${milestoneId} for loan ${input.loanId} was rejected`
      );
    }
    if (existing.status === 'disputed') {
      throw new MilestoneFinalizationError(
        'MILESTONE_DISPUTED',
        `Milestone ${milestoneId} for loan ${input.loanId} is under dispute`
      );
    }
    return cloneRecord(existing);
  }

  const approvedDate = input.approvedAt ? new Date(input.approvedAt) : new Date();
  if (Number.isNaN(approvedDate.getTime())) {
    throw new MilestoneFinalizationError('INVALID_INPUT', 'approvedAt must be a valid ISO date');
  }

  const graceEndsDate = input.gracePeriodEndsAt
    ? new Date(input.gracePeriodEndsAt)
    : new Date(approvedDate.getTime() + (input.gracePeriodMs ?? DEFAULT_MILESTONE_GRACE_PERIOD_MS));
  if (Number.isNaN(graceEndsDate.getTime())) {
    throw new MilestoneFinalizationError(
      'INVALID_INPUT',
      'gracePeriodEndsAt must be a valid ISO date'
    );
  }
  if (graceEndsDate.getTime() <= approvedDate.getTime()) {
    throw new MilestoneFinalizationError(
      'INVALID_INPUT',
      'gracePeriodEndsAt must be after approvedAt'
    );
  }

  const split = calculateVerifierRewardSplit(input.totalDisbursementUsdc);
  const record: MilestoneFinalizationRecord = {
    id: `milestone-fin-${input.loanId.trim()}-${milestoneId}`,
    loanId: input.loanId.trim(),
    milestoneId,
    farmerWalletAddress: input.farmerWalletAddress.trim(),
    approvingVerifierAddress: input.approvingVerifierAddress.trim(),
    escrowSecretKey: input.escrowSecretKey,
    network: input.network ?? 'testnet',
    totalDisbursementUsdc: split.totalDisbursementUsdc,
    split,
    approvedAt: approvedDate.toISOString(),
    gracePeriodEndsAt: graceEndsDate.toISOString(),
    status: 'pending_grace',
  };

  finalizations.set(key, record);
  return cloneRecord(record);
}

/**
 * Rejects a pending milestone during the grace period, blocking both farmer
 * disbursement and the 2% verifier reward share.
 */
export function rejectMilestoneFinalization(
  loanId: string,
  milestoneId = 1,
  reason = 'Milestone verification rejected during grace period'
): MilestoneFinalizationRecord {
  const key = makeKey(loanId, milestoneId);
  const record = finalizations.get(key);
  if (!record) {
    throw new MilestoneFinalizationError(
      'NOT_FOUND',
      `No milestone finalization record found for ${key}`
    );
  }
  if (record.status === 'finalized') {
    throw new MilestoneFinalizationError(
      'ALREADY_FINALIZED',
      `Milestone ${milestoneId} for loan ${loanId} is already finalized`
    );
  }
  record.status = 'rejected';
  record.failureReason = reason;
  return cloneRecord(record);
}

/**
 * Marks a pending milestone as disputed, preventing automatic payout upon
 * grace period expiry.
 */
export function markMilestoneDisputed(
  loanId: string,
  milestoneId = 1,
  reason = 'Dispute opened during grace period'
): MilestoneFinalizationRecord {
  const key = makeKey(loanId, milestoneId);
  const record = finalizations.get(key);
  if (!record) {
    throw new MilestoneFinalizationError(
      'NOT_FOUND',
      `No milestone finalization record found for ${key}`
    );
  }
  if (record.status === 'finalized') {
    throw new MilestoneFinalizationError(
      'ALREADY_FINALIZED',
      `Milestone ${milestoneId} for loan ${loanId} is already finalized`
    );
  }
  record.status = 'disputed';
  record.failureReason = reason;
  return cloneRecord(record);
}

const defaultExecutor: MilestonePayoutExecutor = (record) =>
  Promise.resolve({
    transactionHash: `simulated-finalize-${record.id}`,
  });

/**
 * Finalizes a milestone once its grace period has expired, executing the 98%/2%
 * split between farmer and approving verifier. Enforces strict idempotency and
 * blocks pre-expiry, disputed, rejected, or invalid-verifier payouts.
 */
export async function finalizeMilestonePayout(
  loanId: string,
  milestoneId = 1,
  options: { now?: Date; executePayout?: MilestonePayoutExecutor } = {}
): Promise<MilestoneFinalizationRecord> {
  const key = makeKey(loanId, milestoneId);
  const record = finalizations.get(key);
  if (!record) {
    throw new MilestoneFinalizationError(
      'NOT_FOUND',
      `No milestone finalization record found for ${key}`
    );
  }

  if (inFlightKeys.has(key)) {
    throw new MilestoneFinalizationError(
      'IN_PROGRESS',
      `Milestone ${milestoneId} for loan ${loanId} is currently finalizing`
    );
  }

  if (record.status === 'finalized') {
    throw new MilestoneFinalizationError(
      'ALREADY_FINALIZED',
      `Milestone ${milestoneId} for loan ${loanId} has already been finalized`
    );
  }
  if (record.status === 'rejected') {
    throw new MilestoneFinalizationError(
      'MILESTONE_REJECTED',
      record.failureReason ?? 'Milestone was rejected'
    );
  }
  if (record.status === 'disputed') {
    throw new MilestoneFinalizationError(
      'MILESTONE_DISPUTED',
      record.failureReason ?? 'Milestone is currently under dispute'
    );
  }
  if (!record.approvingVerifierAddress?.trim()) {
    throw new MilestoneFinalizationError(
      'INVALID_VERIFIER',
      'Missing or invalid approving verifier address'
    );
  }

  const now = options.now ?? new Date();
  const graceEnd = new Date(record.gracePeriodEndsAt);
  if (now.getTime() < graceEnd.getTime()) {
    throw new MilestoneFinalizationError(
      'GRACE_PERIOD_ACTIVE',
      `Grace period has not expired yet (expires at ${record.gracePeriodEndsAt})`
    );
  }

  inFlightKeys.add(key);
  try {
    const executor = options.executePayout ?? defaultExecutor;
    const result = await executor(cloneRecord(record));
    record.status = 'finalized';
    record.finalizedAt = now.toISOString();
    record.transactionHash = result.transactionHash;
    record.explorerUrl = result.explorerUrl;
    record.failureReason = undefined;
    return cloneRecord(record);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Milestone payout execution failed';
    record.failureReason = message;
    if (err instanceof MilestoneFinalizationError) {
      throw err;
    }
    throw new MilestoneFinalizationError('PAYOUT_FAILED', message);
  } finally {
    inFlightKeys.delete(key);
  }
}

export function serializeMilestoneFinalization(record: MilestoneFinalizationRecord) {
  return {
    ...record,
    split: {
      totalDisbursementUsdc: record.split.totalDisbursementUsdc,
      verifierRewardUsdc: record.split.verifierRewardUsdc,
      farmerPayoutUsdc: record.split.farmerPayoutUsdc,
      totalStroops: record.split.totalStroops.toString(),
      verifierRewardStroops: record.split.verifierRewardStroops.toString(),
      farmerPayoutStroops: record.split.farmerPayoutStroops.toString(),
    },
  };
}

/**
 * Processes all pending milestones whose grace period has expired at `now`.
 */
export async function processDueMilestoneFinalizations(
  now = new Date(),
  executePayout: MilestonePayoutExecutor = defaultExecutor
): Promise<MilestoneFinalizationRecord[]> {
  const due = [...finalizations.values()].filter(
    (r) => r.status === 'pending_grace' && new Date(r.gracePeriodEndsAt).getTime() <= now.getTime()
  );

  const results: MilestoneFinalizationRecord[] = [];
  for (const record of due) {
    try {
      const finalized = await finalizeMilestonePayout(record.loanId, record.milestoneId, {
        now,
        executePayout,
      });
      results.push(finalized);
    } catch {
      // failureReason is persisted on the record; return snapshot so callers see failure state
      const current = finalizations.get(makeKey(record.loanId, record.milestoneId));
      if (current) results.push(cloneRecord(current));
    }
  }
  return results;
}
