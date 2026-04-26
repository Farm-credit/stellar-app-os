import type { Metadata } from 'next';
import { FarmerDashboard } from '@/components/organisms/FarmerDashboard/FarmerDashboard';

export const metadata: Metadata = {
  title: 'Farmer Dashboard | FarmCredit',
  description: 'Your earnings, planting history, survival rates, and upcoming assignments.',
};

export default function FarmerDashboardPage() {
  return (
    <main className="min-h-screen bg-background pt-24 pb-16 px-4 md:px-8 lg:px-12">
      <div className="max-w-5xl mx-auto">
        <FarmerDashboard />
      </div>
    </main>
  );
}
