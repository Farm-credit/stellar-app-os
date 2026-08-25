'use client';

import { useSearchParams } from 'next/navigation';
import { MyForestDashboard } from '@/components/organisms/MyForestDashboard';
import type { TreeFilterState, TreeSpecies, TreeStatus } from '@/lib/types/tree';

/**
 * Client component that reads URL search params and passes initial filters
 * to the MyForestDashboard.
 *
 * Kept separate from page.tsx so the RSC page can export `metadata` while
 * this component handles the client-side useSearchParams() call inside a
 * Suspense boundary.
 */
function parseFiltersFromParams(searchParams: URLSearchParams): Partial<TreeFilterState> {
  const species = searchParams.get('species');
  const region = searchParams.get('region');
  const status = searchParams.get('status');

  return {
    // Values come from URL params — React renders them as text nodes (XSS-safe).
    search: searchParams.get('search') ?? '',
    species: (species as TreeSpecies) || 'all',
    region: region ?? 'all',
    status: (status as TreeStatus) || 'all',
  };
}

export function MyForestDashboardPage() {
  const searchParams = useSearchParams();
  const initialFilters = parseFiltersFromParams(searchParams);

  return <MyForestDashboard initialFilters={initialFilters} />;
}
