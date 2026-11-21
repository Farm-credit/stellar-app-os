import type { Metadata } from 'next';
import { FieldHealthDashboard } from '@/components/organisms/TreeHealth/FieldHealthDashboard';
import { getMockTrees } from '@/lib/api/mock/trees';
import { getRecentHealthObservations } from '@/lib/tree-health/store';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Field Team Tree Health Dashboard | Stellar App OS',
  description:
    'Mobile-friendly field dashboard for logging tree health observations (height, pest presence, watering status) with real-time sync to sponsor tree profiles.',
};

export default function FieldTeamHealthPage() {
  const trees = getMockTrees();
  const recentObservations = getRecentHealthObservations(10);

  return (
    <main className="min-h-screen bg-slate-50 px-4 pt-24 pb-16 md:px-8">
      <FieldHealthDashboard trees={trees} initialRecentObservations={recentObservations} />
    </main>
  );
}
