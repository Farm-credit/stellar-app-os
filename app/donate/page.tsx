import { Suspense } from "react";
import { DonationAmountStep } from "@/components/organisms/DonationAmountStep/DonationAmountStep";

function DonationAmountStepWrapper() {
  return <DonationAmountStep />;
}

export default function DonatePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={
        <div className="w-full max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-12 bg-gray-200 rounded w-full max-w-2xl mx-auto" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="h-32 bg-gray-200 rounded" />
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-24 bg-gray-200 rounded" />
                  ))}
                </div>
                <div className="h-14 bg-gray-200 rounded" />
              </div>
              <div className="h-96 bg-gray-200 rounded" />
            </div>
          </div>
        </div>
      }>
        <DonationAmountStepWrapper />
      </Suspense>
    </div>
  );
}
