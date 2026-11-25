import type { Metadata } from 'next';
import { BenefactorLeaderboard } from '@/components/benefactors/BenefactorLeaderboard';
import { AppreciationComposer } from '@/components/benefactors/AppreciationComposer';
import { BenefactorMilestoneTimeline } from '@/components/benefactors/BenefactorMilestoneTimeline';
import { RecurringSponsorshipForm } from '@/components/benefactors/RecurringSponsorshipForm';
import { getBenefactorLeaderboard } from '@/lib/benefactors/leaderboard';
import { getProjectMilestones } from '@/lib/benefactors/milestones';

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
      <div className="mx-auto max-w-7xl space-y-8 px-4 pb-12 sm:px-6 lg:px-8">
        <RecurringSponsorshipForm
          stewardAddress="GCRHL2HAEVIBZSINXNTBAEGMJK6GCYPVJDZZKKWPM3P6277FFSEDUQNO"
          poolAddress={process.env.NEXT_PUBLIC_COMMUNITY_POOL_ADDRESS ?? ''}
          tokenAddress={process.env.NEXT_PUBLIC_USDC_TOKEN_CONTRACT ?? ''}
        />
        <BenefactorMilestoneTimeline milestones={getProjectMilestones('community-pool-001')} />
        <AppreciationComposer
          benefactorId="public-benefactor"
          stewardId="community-steward-001"
          milestoneId="community-pool-001-verified"
          sharedSecret={process.env.NEXT_PUBLIC_APPRECIATION_SESSION_KEY ?? ''}
        />
      </div>
    </main>
  );
}
