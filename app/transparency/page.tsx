import { FundAllocationTransparency } from '@/components/organisms/FundAllocationTransparency';
import { NativeSpeciesTransparency } from '@/components/organisms/NativeSpeciesTransparency';

export const metadata = {
  title: 'Transparency | FarmCredit',
  description: 'See how sponsor funds are allocated and how FarmCredit prioritizes native species.',
};

const seedProvenanceSummary = {
  totalSeedBatches: 48,
  seedBanks: 6,
  nurseries: 14,
  plantingSites: 32,
  provenanceVerifiedBatches: 45,
  provenancePendingBatches: 3,
  seedsDistributed: 128500,
  seedsPlanted: 96400,
};

export default function TransparencyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stellar-blue">
            Open impact reporting
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Platform transparency
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Review the latest fund allocation breakdown, annual independent audit status, and our
            minimum native-species policy.
          </p>
        </header>
        <FundAllocationTransparency />
        <NativeSpeciesTransparency
          nativeTrees={9200}
          totalTrees={10000}
          seedProvenance={seedProvenanceSummary}
        />
      </div>
    </main>
  );
}