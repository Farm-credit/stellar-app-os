import { Suspense } from 'react';
import { PaymentStep } from '@/components/organisms/PaymentStep/PaymentStep';

function PaymentStepWrapper() {
  return <PaymentStep />;
}

export default function DonatePaymentPage() {
  return (
    <div className="min-h-screen bg-background">
      <Suspense
        fallback={
          <div className="w-full max-w-7xl mx-auto px-4 py-8">
            <div className="animate-pulse space-y-8">
              {/* Stepper skeleton */}
              <div className="h-12 bg-muted rounded w-full max-w-2xl mx-auto" />

              {/* Header skeleton */}
              <div className="space-y-3 text-center">
                <div className="h-8 bg-muted rounded w-1/3 mx-auto" />
                <div className="h-4 bg-muted rounded w-1/4 mx-auto" />
              </div>

              {/* Two-column skeleton */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
                <div className="space-y-6">
                  <div className="h-14 bg-muted rounded" />
                  <div className="h-80 bg-muted rounded-2xl" />
                </div>
                <div className="h-96 bg-muted rounded-xl" />
              </div>
            </div>
          </div>
        }
      >
        <PaymentStepWrapper />
      </Suspense>
    </div>
  );
}
