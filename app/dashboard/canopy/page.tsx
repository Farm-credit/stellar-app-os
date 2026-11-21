import { type Metadata } from 'next';
import { CanopyAnalyticsDashboard } from '@/components/organisms/CanopyAnalyticsDashboard';

export const metadata: Metadata = {
  title: 'Canopy Analytics | Stellar App OS',
  description:
    'Canopy coverage, species composition, height and growth rate from lidar, drone and satellite analysis.',
};

export default function CanopyAnalyticsPage() {
  return (
    <main className="min-h-screen bg-background pt-24 pb-16 px-4 md:px-8 lg:px-12">
      <div className="max-w-7xl mx-auto">
        <CanopyAnalyticsDashboard />
      </div>
    </main>
  );
}
