import { Metadata } from 'next';
import { DashboardOverview } from '@/components/organisms/DashboardOverview';

export const metadata: Metadata = {
  title: 'Dashboard | Stellar App OS',
  description: 'Your environmental impact overview and recent activity.',
};

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-background pt-24 pb-16 px-4 md:px-8 lg:px-12">
      <div className="max-w-7xl mx-auto">
        <DashboardOverview />
      </div>
    </main>
  );
}
