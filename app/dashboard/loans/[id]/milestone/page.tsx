'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { Text } from '@/components/atoms/Text';
import { MilestoneErrorBoundary } from '@/components/organisms/MilestoneErrorBoundary';
import { MilestoneVerificationForm } from '@/components/organisms/MilestoneVerificationForm/MilestoneVerificationForm';
import { MilestoneTimeline, type MilestoneItem } from '@/components/MileStoneTimeline';

// Demo loan data — replace with real data fetching once a DB/API layer exists
const DEMO_LOAN = {
  id: 'loan-001',
  farmerWalletAddress: 'GABEMKJNR4GK7M4FROGA7I7PG63N2CKE3EGDSBSISG56SVL2O3KRNDXA',
  // In production this secret must come from a secure server-side store, never the client
  escrowSecretKey: process.env.NEXT_PUBLIC_DEMO_ESCROW_SECRET ?? '',
  totalAmountUsdc: 1000,
  network: 'testnet' as const,
};

interface SerializedFinalization {
  loanId: string;
  milestoneId: number;
  status: 'pending_grace' | 'finalized' | 'rejected' | 'disputed';
  approvingVerifierAddress: string;
  gracePeriodEndsAt: string;
  finalizedAt?: string;
  split: {
    totalDisbursementUsdc: number;
    farmerPayoutUsdc: number;
    verifierRewardUsdc: number;
  };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MilestoneReleasePage({ params }: PageProps) {
  const { id } = use(params);
  const loan = { ...DEMO_LOAN, id };
  const [finalization, setFinalization] = useState<SerializedFinalization | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const loadFinalization = useCallback(async () => {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const res = await fetch(
        `/api/escrow/finalize?loanId=${encodeURIComponent(id)}&milestoneId=1`
      );
      if (res.status === 404) {
        setFinalization(null);
        return;
      }
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Failed to fetch milestone payout status');
      }
      const data = (await res.json()) as { finalization?: SerializedFinalization };
      setFinalization(data.finalization ?? null);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to load milestone status');
    } finally {
      setLoadingStatus(false);
    }
  }, [id]);

  useEffect(() => {
    void loadFinalization();
  }, [loadFinalization]);

  async function handleFinalizeMilestone() {
    const res = await fetch('/api/escrow/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'finalize', loanId: id, milestoneId: 1 }),
    });
    const data = (await res.json()) as {
      error?: string;
      finalization?: SerializedFinalization;
    };
    if (!res.ok || !data.finalization) {
      throw new Error(data.error ?? 'Milestone finalization failed');
    }
    setFinalization(data.finalization);
  }

  const timelineItems: MilestoneItem[] | undefined = finalization
    ? [
        {
          id: 'm1',
          title: 'Milestone 1: Planting & GPS Proof',
          payoutPercent: 75,
          status:
            finalization.status === 'finalized'
              ? 'Completed'
              : finalization.status === 'disputed' || finalization.status === 'rejected'
                ? 'Disputed'
                : 'Pending Grace',
          amount: `$${finalization.split.totalDisbursementUsdc.toFixed(2)}`,
          verifierReward: `$${finalization.split.verifierRewardUsdc.toFixed(2)} (2%)`,
          verifierAddress: finalization.approvingVerifierAddress,
          graceExpiresAt: finalization.gracePeriodEndsAt,
          canFinalize: new Date(finalization.gracePeriodEndsAt).getTime() <= Date.now(),
          date: finalization.finalizedAt,
          description:
            'Automatically splits 98% to farmer and 2% to the approving verifier upon grace period expiry.',
        },
      ]
    : undefined;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div>
        <Text variant="h2" as="h1" className="mb-1">
          Milestone 1 Release
        </Text>
        <Text variant="muted" className="text-sm">
          Loan <span className="font-mono">{id}</span>
        </Text>
      </div>

      <MilestoneErrorBoundary fallbackTitle="Milestone verification form failed to load">
        <MilestoneVerificationForm
          loanId={loan.id}
          farmerWalletAddress={loan.farmerWalletAddress}
          escrowSecretKey={loan.escrowSecretKey}
          totalAmountUsdc={loan.totalAmountUsdc}
          network={loan.network}
          onSuccess={() => void loadFinalization()}
        />
      </MilestoneErrorBoundary>

      <MilestoneErrorBoundary fallbackTitle="Milestone payout timeline unavailable">
        {loadingStatus ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground"
          >
            Loading milestone finalization status…
          </div>
        ) : statusError ? (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
          >
            {statusError}
          </div>
        ) : (
          <MilestoneTimeline
            farmerAddress={loan.farmerWalletAddress}
            totalAmount={`$${loan.totalAmountUsdc.toLocaleString()}`}
            items={timelineItems}
            onFinalize={finalization ? () => handleFinalizeMilestone() : undefined}
          />
        )}
      </MilestoneErrorBoundary>
    </div>
  );
}
