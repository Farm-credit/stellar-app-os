import { Suspense } from 'react';
import { DonorInfoStep } from '@/components/organisms/DonorInfoStep/DonorInfoStep';

function DonorInfoStepWrapper() {
  return <DonorInfoStep />;
}

export default function DonateInfoPage() {
  return (
    <div className="min-h-screen bg-background">
      <Suspense
        fallback={
          <div className="w-full max-w-3xl mx-auto px-4 py-8">
            <div className="animate-pulse space-y-8">
              <div className="h-12 bg-muted rounded w-full max-w-2xl mx-auto" />
              <div className="space-y-6">
                <div className="h-8 bg-muted rounded w-3/4 mx-auto" />
                <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
                <div className="h-64 bg-muted rounded" />
              </div>
            </div>
          </div>
        }
      >
        <DonorInfoStepWrapper />
      </Suspense>
    </div>
  );
}
