import type { Metadata } from 'next';
import { CorporateBuyerDashboard } from '@/components/organisms/CorporateBuyerDashboard/CorporateBuyerDashboard';

export const metadata: Metadata = {
  title: 'Corporate Offset Dashboard',
  description: 'Track purchased carbon offsets, cost per ton, co-benefits, supply chain, and trends.',
};

export default function CorporateDashboardPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <CorporateBuyerDashboard />
    </main>
  );
}
