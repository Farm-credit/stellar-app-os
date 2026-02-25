'use client';

import { Suspense } from 'react';
import { Text } from '@/components/atoms/Text';
import { CreditPortfolio } from '@/components/organisms/CreditPortfolio';

// Disable static generation for this page since it requires WalletContext
export const dynamic = 'force-dynamic';

function CreditsContent() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="space-y-6">
        <div>
          <Text variant="h2" as="h1" className="mb-2">
            My Carbon Credits
          </Text>
          <Text variant="muted" as="p">
            View and manage your carbon credit portfolio in real-time.
          </Text>
        </div>

        <CreditPortfolio />
      </div>
    </div>
  );
}

export default function DashboardCreditsPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-6xl px-4 py-8">
          <div className="space-y-6">
            <div>
              <Text variant="h2" as="h1" className="mb-2">
                My Carbon Credits
              </Text>
              <Text variant="muted" as="p">
                Loading your portfolio...
              </Text>
            </div>
          </div>
        </div>
      }
    >
      <CreditsContent />
    </Suspense>
  );
}
