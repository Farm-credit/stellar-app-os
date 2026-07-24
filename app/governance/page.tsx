import { type Metadata } from 'next';
import { SpeciesGovernance } from '@/components/organisms/SpeciesVoting/SpeciesGovernance';

export const metadata: Metadata = {
  title: 'Species Governance | Stellar App OS',
  description: 'Propose and vote for new tree species to add to the catalogue.',
};

export default function GovernancePage() {
  return (
    <main className="min-h-screen bg-background pt-24 pb-16 px-4 md:px-8 lg:px-12">
      <div className="max-w-7xl mx-auto">
        <SpeciesGovernance />
      </div>
    </main>
  );
}
