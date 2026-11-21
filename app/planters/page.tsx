import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import { PlanterDirectory } from '@/components/organisms/PlanterDirectory';

export const metadata: Metadata = {
  title: 'Planters | FarmCredit',
  description:
    'Meet the planters growing and caring for your trees — their background, expertise, and community work.',
};

export default function PlantersPage() {
  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-24 md:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-6 w-6 text-stellar-green" aria-hidden />
            <Text variant="h2" as="h1">
              Planters
            </Text>
          </div>
          <Text variant="muted" as="p" className="max-w-2xl">
            Get to know the people behind your trees. Explore their background, expertise, and
            community work — then connect with the planters growing your forest.
          </Text>
        </header>

        <PlanterDirectory />
      </div>
    </main>
  );
}
