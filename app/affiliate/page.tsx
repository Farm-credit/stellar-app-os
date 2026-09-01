import type { Metadata } from 'next';
import { AffiliateDashboard } from '@/components/organisms/AffiliateDashboard';

export const metadata: Metadata = {
  title: 'Affiliate Program | FarmCredit',
  description:
    'Earn 10–25% revenue share for every sponsor you refer to FarmCredit. Join the affiliate program and get paid for growing the forest.',
};

export default function AffiliatePage() {
  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-24 md:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <AffiliateDashboard />
      </div>
    </main>
  );
}
