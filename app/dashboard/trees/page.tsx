'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Text } from '@/components/atoms/Text';
import { SponsorTreeList } from '@/components/organisms/SponsorTreeList';
import type { TreeFilterState, TreeSpecies, TreeStatus } from '@/lib/types/tree';
import { TreePine } from 'lucide-react';

function parseFiltersFromParams(searchParams: URLSearchParams): Partial<TreeFilterState> {
  const species = searchParams.get('species');
  const region = searchParams.get('region');
  const status = searchParams.get('status');

  return {
    search: searchParams.get('search') || '',
    species: (species as TreeSpecies) || 'all',
    region: region || 'all',
    status: (status as TreeStatus) || 'all',
  };
}

function SponsorTreesPageContent() {
  const searchParams = useSearchParams();
  const initialFilters = parseFiltersFromParams(searchParams);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6 sm:mb-8">
        <div className="mb-2 flex items-center gap-2">
          <TreePine className="h-6 w-6 text-stellar-green" aria-hidden />
          <Text variant="h2" as="h1" className="text-2xl sm:text-3xl">
            My Trees
          </Text>
        </div>
        <Text variant="muted" as="p">
          Search and filter your sponsored trees by species, region, and planting status.
        </Text>
      </header>

      <SponsorTreeList initialFilters={initialFilters} />
    </div>
  );
}

export default function SponsorTreesPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8">Loading...</div>}>
      <SponsorTreesPageContent />
    </Suspense>
  );
}
