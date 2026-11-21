import type { Metadata } from 'next';
import { BenefactorLeaderboard } from '@/components/benefactors/BenefactorLeaderboard';
import { getBenefactorLeaderboard } from '@/lib/benefactors/leaderboard';

export const metadata: Metadata = {
  title: 'Benefactor Leaderboard | Farm Credit',
  description:
    'Public leaderboard ranking top corporate and individual benefactors by hectares restored, ecological impact credits funded, and community stewards supported.',
};

export default function BenefactorsPage() {
  const initialData = getBenefactorLeaderboard({
    type: 'all',
    period: 'all-time',
    sortBy: 'hectares',
  });

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <BenefactorLeaderboard initialData={initialData} />
    </main>
  );
}
