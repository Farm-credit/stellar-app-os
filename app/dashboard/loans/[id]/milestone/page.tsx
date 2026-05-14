'use client';

import { use } from 'react';
import { Text } from '@/components/atoms/Text';
import { MilestoneVerificationForm } from '@/components/organisms/MilestoneVerificationForm/MilestoneVerificationForm';

// Demo loan data — replace with real data fetching once a DB/API layer exists
const DEMO_LOAN = {
  id: 'loan-001',
  farmerWalletAddress: 'GABEMKJNR4GK7M4FROGA7I7PG63N2CKE3EGDSBSISG56SVL2O3KRNDXA',
  // In production this secret must come from a secure server-side store, never the client
  escrowSecretKey: process.env.NEXT_PUBLIC_DEMO_ESCROW_SECRET ?? '',
  totalAmountUsdc: 1000,
  network: 'testnet' as const,
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MilestoneReleasePage({ params }: PageProps) {
  const { id } = use(params);
  const loan = { ...DEMO_LOAN, id };

  return (
    <div className="container mx-auto max-w-xl px-4 py-10 space-y-6">
      <div>
        <Text variant="h2" as="h1" className="mb-1">
          Milestone 1 Release
        </Text>
        <Text variant="muted" className="text-sm">
          Loan <span className="font-mono">{id}</span>
        </Text>
      </div>

      <MilestoneVerificationForm
        loanId={loan.id}
        farmerWalletAddress={loan.farmerWalletAddress}
        escrowSecretKey={loan.escrowSecretKey}
        totalAmountUsdc={loan.totalAmountUsdc}
        network={loan.network}
      />
    </div>
  );
}
