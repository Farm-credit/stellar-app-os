import type { Metadata } from 'next';
import { SpeciesBrowser } from '@/components/organisms/SpeciesBrowser';

export const metadata: Metadata = {
  title: 'Tree Species — Stellar Farm Credit',
  description:
    'Browse the species you can sponsor, and prioritise endangered trees that need funding most.',
};

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function SpeciesPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-bold">Choose a species to sponsor</h1>
      <p className="mb-8 mt-2 max-w-2xl text-muted-foreground">
        Every species below can be planted through the platform. Endangered species are flagged so
        you can direct funding where it protects the most at-risk trees.
      </p>
      <SpeciesBrowser initialTab={tab === 'endangered' ? 'endangered' : 'all'} />
    </main>
  );
}
