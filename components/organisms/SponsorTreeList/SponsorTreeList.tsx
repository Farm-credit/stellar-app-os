'use client';

import Link from 'next/link';
import { TreePine, MapPin, Leaf } from 'lucide-react';
import { TreeFilterBar } from '@/components/molecules/TreeFilterBar';
import { TreeStatusBadge } from '@/components/molecules/TreeStatusBadge';
import { Text } from '@/components/atoms/Text';
import { Skeleton } from '@/components/atoms/Skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { useSponsorTrees } from '@/hooks/useSponsorTrees';
import type { TreeFilterState } from '@/lib/types/tree';

function fmtDate(iso?: string) {
  if (!iso) return 'Not yet planted';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface SponsorTreeListProps {
  initialFilters?: Partial<TreeFilterState>;
}

/**
 * Sponsor tree portfolio with search and filter by species, region, and status.
 * Requirements: Issue #539
 */
export function SponsorTreeList({ initialFilters }: SponsorTreeListProps) {
  const {
    trees,
    filters,
    speciesOptions,
    regionOptions,
    statusOptions,
    totalCount,
    isLoading,
    error,
    updateFilters,
  } = useSponsorTrees(initialFilters);

  return (
    <div className="space-y-6">
      <TreeFilterBar
        filters={filters}
        speciesOptions={speciesOptions}
        regionOptions={regionOptions}
        statusOptions={statusOptions}
        onFilterChange={updateFilters}
      />

      <Text variant="muted" as="p" aria-live="polite">
        {isLoading
          ? 'Loading trees...'
          : totalCount === 0
            ? 'No trees match your filters'
            : `Showing ${totalCount} ${totalCount === 1 ? 'tree' : 'trees'}`}
      </Text>

      {error && (
        <Text variant="small" className="text-destructive" role="alert">
          {error}
        </Text>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TreePine className="h-5 w-5 text-stellar-green" aria-hidden />
            My Forest
          </CardTitle>
          <CardDescription>
            Track every tree you have sponsored — species, region, planting status, and CO₂ impact.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-4 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : trees.length === 0 ? (
            <div className="p-10 text-center">
              <Text variant="muted">Try adjusting your search or filters to find trees.</Text>
            </div>
          ) : (
            <ul className="divide-y" role="list">
              {trees.map((tree) => (
                <li key={tree.id} className="px-4 py-4 sm:px-6">
                  <Link
                    href={`/trees/${tree.id}`}
                    className="block rounded-lg transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-green"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Text className="font-semibold">{tree.treeId}</Text>
                          <TreeStatusBadge status={tree.status} />
                        </div>
                        <Text className="text-muted-foreground">{tree.projectName}</Text>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground sm:gap-4">
                          <span className="inline-flex items-center gap-1">
                            <Leaf className="h-3.5 w-3.5" aria-hidden />
                            {tree.species}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" aria-hidden />
                            {tree.region}
                          </span>
                        </div>
                      </div>
                      <div className="text-left text-sm sm:text-right">
                        <Text className="font-medium text-stellar-green">
                          ~{tree.co2OffsetKgPerYear} kg CO₂/yr
                        </Text>
                        <Text className="text-muted-foreground">{fmtDate(tree.plantedAt)}</Text>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
