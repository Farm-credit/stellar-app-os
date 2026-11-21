import { type Metadata } from 'next';
import { TreeCensusForm } from '@/components/organisms/Census/TreeCensusForm';

export const metadata: Metadata = {
  title: 'Annual Tree Census Submission | Field Operations | Stellar App OS',
  description:
    'Annual tree census workflow for field teams to log survival counts, height measurements, and health observations, automatically updating project survival rates.',
};

export default function TreeCensusPage() {
  return (
    <main className="min-h-screen bg-slate-50 pt-24 pb-16 px-4 md:px-8">
      <TreeCensusForm />
    </main>
  );
}
