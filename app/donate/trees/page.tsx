import { Suspense } from 'react';
import { Trees } from 'lucide-react';
import { TreeDonationForm } from '@/components/organisms/TreeDonationForm/TreeDonationForm';
import { AnonymousQuickPay } from '@/components/molecules/AnonymousQuickPay/AnonymousQuickPay';

export const dynamic = 'force-dynamic';

function TreeDonationFormWrapper() {
  return <TreeDonationForm />;
}

export const metadata = {
  title: 'Plant Trees — Stellar Farm Credit',
  description:
    'Select the number of trees you want to plant (minimum 2) and donate via Freighter wallet or credit card.',
};

export default function TreeDonatePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
        {/* Page header */}
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stellar-green">
            <Trees className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">Plant Trees</h1>
        </div>
        <p className="mb-8 text-muted-foreground sm:mb-10">
          Every tree you sponsor is planted by a local farmer in Nigeria and tracked on the Stellar
          blockchain. Minimum donation is 2 trees.
        </p>

        <div className="grid gap-6 sm:gap-8">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-10">
            <AnonymousQuickPay />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-10">
            <Suspense
              fallback={
                <div className="animate-pulse space-y-6">
                  <div className="h-8 bg-gray-200 rounded w-1/3" />
                  <div className="flex gap-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-10 w-20 bg-gray-200 rounded-full" />
                    ))}
                  </div>
                  <div className="h-16 bg-gray-200 rounded-xl" />
                  <div className="h-36 bg-gray-200 rounded-xl" />
                </div>
              }
            >
              <TreeDonationFormWrapper />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
