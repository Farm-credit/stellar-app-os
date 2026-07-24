import { type Metadata } from 'next';
import { CarbonDashboard } from '@/components/organisms/CarbonDashboard';

export const metadata: Metadata = {
  title: 'Carbon Footprint | Stellar App OS',
  description:
    'Track your personal tree contributions, carbon offset projections, and badge accomplishments.',
};

export default function CarbonDashboardPage() {
  return (
    <main className="min-h-screen bg-background pt-24 pb-16 px-4 md:px-8 lg:px-12">
      <div className="max-w-7xl mx-auto">
        <CarbonDashboard />
      </div>
    </main>
  );
}
