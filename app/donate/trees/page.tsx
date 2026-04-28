import { Suspense } from 'react';
import { Trees } from 'lucide-react';
import { TreeDonationForm } from '@/components/organisms/TreeDonationForm/TreeDonationForm';

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
      <div className="w-full max-w-3xl mx-auto px-4 py-12">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-stellar-green">
            <Trees className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold">Plant Trees</h1>
        </div>
        <p className="text-muted-foreground mb-10">
          Every tree you sponsor is planted by a local farmer in Nigeria and tracked on the Stellar
          blockchain. Minimum donation is 2 trees.
        </p>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-10">
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
  );
}
