import { NextResponse } from 'next/server';
import {
  approveMilestoneWithGracePeriod,
  finalizeMilestonePayout,
  getMilestoneFinalization,
  listMilestoneFinalizations,
  markMilestoneDisputed,
  MilestoneFinalizationError,
  processDueMilestoneFinalizations,
  rejectMilestoneFinalization,
  serializeMilestoneFinalization,
  type MilestonePayoutExecutor,
} from '@/lib/escrow/milestone-finalization';
import { executeMilestoneFinalizationOnStellar } from '@/lib/stellar/escrow';
import { emitMilestonePayoutApproved } from '@/lib/webhook/events';

function mapErrorStatus(code: MilestoneFinalizationError['code']): number {
  switch (code) {
    case 'INVALID_INPUT':
    case 'INVALID_VERIFIER':
      return 400;
    case 'NOT_FOUND':
      return 404;
    case 'PAYOUT_FAILED':
      return 502;
    default:
      return 409;
  }
}

function buildExecutor(): MilestonePayoutExecutor {
  return (record) => {
    if (record.escrowSecretKey) {
      return executeMilestoneFinalizationOnStellar(record);
    }
    return Promise.resolve({
      transactionHash: `simulated-finalize-${record.id}`,
    });
  };
}

function emitFinalizedWebhook(record: ReturnType<typeof serializeMilestoneFinalization>): void {
  if (record.status !== 'finalized' || !record.transactionHash) return;
  void emitMilestonePayoutApproved({
    loanId: record.loanId,
    farmerWalletAddress: record.farmerWalletAddress,
    releasedAmountUsdc: record.totalDisbursementUsdc,
    farmerPayoutUsdc: record.split.farmerPayoutUsdc,
    verifierWalletAddress: record.approvingVerifierAddress,
    verifierRewardUsdc: record.split.verifierRewardUsdc,
    network: record.network,
    transactionHash: record.transactionHash,
    explorerUrl: record.explorerUrl ?? '',
    approvedAt: record.finalizedAt ?? new Date().toISOString(),
  });
}

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const loanId = searchParams.get('loanId');
  if (!loanId) {
    return NextResponse.json({
      finalizations: listMilestoneFinalizations().map(serializeMilestoneFinalization),
    });
  }

  const milestoneIdRaw = searchParams.get('milestoneId');
  const milestoneId = milestoneIdRaw ? Number(milestoneIdRaw) : 1;
  if (!Number.isInteger(milestoneId) || milestoneId < 1) {
    return NextResponse.json({ error: 'milestoneId must be a positive integer' }, { status: 400 });
  }

  const record = getMilestoneFinalization(loanId, milestoneId);
  if (!record) {
    return NextResponse.json({ error: 'Milestone finalization not found' }, { status: 404 });
  }

  return NextResponse.json({ finalization: serializeMilestoneFinalization(record) });
}

interface FinalizePostBody {
  action?: 'approve' | 'finalize' | 'reject' | 'dispute' | 'process_due';
  loanId?: string;
  milestoneId?: number;
  farmerWalletAddress?: string;
  approvingVerifierAddress?: string;
  totalDisbursementUsdc?: number;
  escrowSecretKey?: string;
  network?: 'testnet' | 'mainnet';
  approvedAt?: string;
  gracePeriodEndsAt?: string;
  gracePeriodMs?: number;
  asOf?: string;
  reason?: string;
}

export async function POST(request: Request) {
  let body: FinalizePostBody;
  try {
    body = (await request.json()) as FinalizePostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    switch (body.action) {
      case 'approve': {
        const record = approveMilestoneWithGracePeriod({
          loanId: body.loanId ?? '',
          milestoneId: body.milestoneId,
          farmerWalletAddress: body.farmerWalletAddress ?? '',
          approvingVerifierAddress: body.approvingVerifierAddress ?? '',
          totalDisbursementUsdc: body.totalDisbursementUsdc ?? 0,
          escrowSecretKey: body.escrowSecretKey,
          network: body.network,
          approvedAt: body.approvedAt,
          gracePeriodEndsAt: body.gracePeriodEndsAt,
          gracePeriodMs: body.gracePeriodMs,
        });
        return NextResponse.json(
          { finalization: serializeMilestoneFinalization(record) },
          { status: 201 }
        );
      }

      case 'finalize': {
        if (!body.loanId?.trim()) {
          return NextResponse.json({ error: 'loanId is required' }, { status: 400 });
        }
        const now = body.asOf ? new Date(body.asOf) : new Date();
        if (Number.isNaN(now.getTime())) {
          return NextResponse.json({ error: 'Invalid asOf timestamp' }, { status: 400 });
        }
        const finalized = await finalizeMilestonePayout(body.loanId.trim(), body.milestoneId ?? 1, {
          now,
          executePayout: buildExecutor(),
        });
        const serialized = serializeMilestoneFinalization(finalized);
        emitFinalizedWebhook(serialized);
        return NextResponse.json({ finalization: serialized });
      }

      case 'reject': {
        if (!body.loanId?.trim()) {
          return NextResponse.json({ error: 'loanId is required' }, { status: 400 });
        }
        const rejected = rejectMilestoneFinalization(
          body.loanId.trim(),
          body.milestoneId ?? 1,
          body.reason
        );
        return NextResponse.json({ finalization: serializeMilestoneFinalization(rejected) });
      }

      case 'dispute': {
        if (!body.loanId?.trim()) {
          return NextResponse.json({ error: 'loanId is required' }, { status: 400 });
        }
        const disputed = markMilestoneDisputed(
          body.loanId.trim(),
          body.milestoneId ?? 1,
          body.reason
        );
        return NextResponse.json({ finalization: serializeMilestoneFinalization(disputed) });
      }

      case 'process_due': {
        const now = body.asOf ? new Date(body.asOf) : new Date();
        if (Number.isNaN(now.getTime())) {
          return NextResponse.json({ error: 'Invalid asOf timestamp' }, { status: 400 });
        }
        const processed = await processDueMilestoneFinalizations(now, buildExecutor());
        const serialized = processed.map(serializeMilestoneFinalization);
        for (const item of serialized) {
          emitFinalizedWebhook(item);
        }
        return NextResponse.json({ finalizations: serialized });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported: approve, finalize, reject, dispute, process_due' },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof MilestoneFinalizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: mapErrorStatus(error.code) }
      );
    }
    const message = error instanceof Error ? error.message : 'Milestone finalization failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
