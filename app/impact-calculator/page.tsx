import { Suspense } from 'react';
import { ImpactCalculator } from '@/components/organisms/ImpactCalculator/ImpactCalculator';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Carbon Footprint Calculator | FarmCredit',
  description:
    'Calculate your annual carbon footprint and find out how many carbon credits you need to offset your emissions.',
  openGraph: {
    title: 'Carbon Footprint Calculator | FarmCredit',
    description: 'Calculate your annual carbon footprint and discover how to go carbon neutral.',
  },
};

function ImpactCalculatorWrapper() {
  return <ImpactCalculator />;
}

export default function ImpactCalculatorPage() {
  return (
    <div className="min-h-screen bg-background">
      <Suspense
        fallback={
          <div className="w-full max-w-3xl mx-auto px-4 py-8">
            <div className="animate-pulse space-y-8">
              <div className="h-8 bg-muted rounded w-48 mx-auto" />
              <div className="h-10 bg-muted rounded w-3/4 mx-auto" />
              <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
              <div className="h-12 bg-muted rounded" />
              <div className="h-96 bg-muted rounded" />
            </div>
          </div>
        }
      >
        <ImpactCalculatorWrapper />
      </Suspense>
    </div>
  );
}
