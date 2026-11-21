import { type Metadata } from 'next';
import { TreeCensusForm } from '@/components/organisms/Census/TreeCensusForm';

export const metadata: Metadata = {
  title: 'Field Team Census Submission | Stellar App OS',
  description:
    'Dedicated tool for field teams to submit annual tree census batches and review real-time survival calculations.',
};

export default function FieldTeamCensusPage() {
  return (
    <main className="min-h-screen bg-slate-50 pt-24 pb-16 px-4 md:px-8">
      <TreeCensusForm />
    </main>
  );
}
