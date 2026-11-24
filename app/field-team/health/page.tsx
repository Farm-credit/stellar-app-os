import type { Metadata } from 'next';
import { PWAProvider } from '@/components/providers/PWAProvider';
import { FieldHealthDashboard } from '@/components/organisms/TreeHealth/FieldHealthDashboard';
import { getMockTrees } from '@/lib/api/mock/trees';
import { getRecentHealthObservations } from '@/lib/tree-health/store';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mobile Field Audit Checklist | Stellar App OS',
  description:
    'Mobile field checklist for recording soil moisture, sapling height, pest damage, and verifier audit decisions.',
};

export default function FieldTeamHealthPage() {
  const trees = getMockTrees();
  const recentObservations = getRecentHealthObservations(10);

  return (
    <div className="min-h-screen bg-slate-50 px-4 pt-24 pb-16 md:px-8">
      <PWAProvider>
        <FieldHealthDashboard trees={trees} initialRecentObservations={recentObservations} />
      </PWAProvider>
    </div>
  );
}
