'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TreePine, Wind, Users, Globe } from 'lucide-react';
import { ImpactStatCard } from '@/components/atoms/ImpactStatCard';
import { TreeFilterBar } from '@/components/molecules/TreeFilterBar';
import { Text } from '@/components/atoms/Text';
import { ImpactMapClient } from '@/components/organisms/ImpactMap/ImpactMapClient';
import {
  IMPACT_DATA,
  toRegionMarkers,
  type LiveRegionAggregate,
  type RegionMarker,
} from '@/lib/api/impactData';
import { fetchPublicTrees } from '@/lib/api/trees';
import type { Tree, TreeFilterState, TreeSpecies, TreeStatus } from '@/lib/types/tree';

const DEFAULT_FILTERS: TreeFilterState = {
  search: '',
  species: 'all',
  region: 'all',
  status: 'verified',
};

/**
 * Public impact explorer with tree search/filter and map markers.
 * Requirements: Issue #539
 */
export function ImpactExplorer() {
  const { stats } = IMPACT_DATA;
  const [filters, setFilters] = useState<TreeFilterState>(DEFAULT_FILTERS);
  const [regions, setRegions] = useState<RegionMarker[]>(IMPACT_DATA.regions);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [speciesOptions, setSpeciesOptions] = useState<TreeSpecies[]>([]);
  const [regionOptions, setRegionOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<TreeStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTrees = useCallback(async (nextFilters: TreeFilterState) => {
    setIsLoading(true);
    try {
      const response = await fetchPublicTrees(nextFilters);
      setTrees(response.trees);
      setSpeciesOptions(response.speciesOptions);
      setRegionOptions(response.regionOptions);
      setStatusOptions(response.statusOptions);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTrees(filters);
  }, [filters, loadTrees]);

  useEffect(() => {
    let isMounted = true;

    const loadRegions = async () => {
      try {
        const response = await fetch('/api/map/regions');
        if (!response.ok) {
          throw new Error(`Region request failed: ${response.status}`);
        }

        const data = (await response.json()) as { regions?: LiveRegionAggregate[] };
        if (!isMounted) return;

        setRegions(data.regions?.length ? toRegionMarkers(data.regions) : IMPACT_DATA.regions);
      } catch (error) {
        console.error('[ImpactExplorer] Unable to load live region data:', error);
        if (isMounted) {
          setRegions(IMPACT_DATA.regions);
        }
      }
    };

    void loadRegions();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateFilters = useCallback((partial: Partial<TreeFilterState>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  }, []);

  const filteredRegions = useMemo(() => {
    if (filters.region === 'all') return regions;
    return regions.filter((r) => r.name === filters.region);
  }, [filters.region, regions]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Our Impact</h1>
        <p className="mt-2 text-muted-foreground">
          Real-time planting activity across FarmCredit-supported regions.
        </p>
      </div>

      <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <ImpactStatCard
          label="Trees Planted"
          value={stats.treesPlanted.toLocaleString()}
          icon={<TreePine className="h-5 w-5 text-[#00B36B]" aria-hidden />}
        />
        <ImpactStatCard
          label="CO₂ Offset (tonnes)"
          value={stats.co2OffsetTonnes.toLocaleString()}
          icon={<Wind className="h-5 w-5 text-[#14B6E7]" aria-hidden />}
        />
        <ImpactStatCard
          label="Farmers Supported"
          value={stats.farmersSupported.toLocaleString()}
          icon={<Users className="h-5 w-5 text-[#3E1BDB]" aria-hidden />}
        />
        <ImpactStatCard
          label="Countries Reached"
          value={stats.countriesReached.toString()}
          icon={<Globe className="h-5 w-5 text-[#00C2FF]" aria-hidden />}
        />
      </div>

      <div className="mb-6">
        <TreeFilterBar
          filters={filters}
          speciesOptions={speciesOptions}
          regionOptions={regionOptions}
          statusOptions={statusOptions}
          onFilterChange={updateFilters}
        />
      </div>

      <Text variant="muted" as="p" className="mb-4" aria-live="polite">
        {isLoading
          ? 'Loading map data...'
          : trees.length === 0
            ? 'No trees match your filters on the map'
            : `Showing ${trees.length} ${trees.length === 1 ? 'tree' : 'trees'} on the map`}
      </Text>

      <div
        className="h-[min(70vh,480px)] min-h-[280px] overflow-hidden rounded-xl border shadow-sm sm:h-[480px]"
      >
        <ImpactMapClient regions={filteredRegions} trees={trees} />
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground px-2">
        Region clusters show verified trees grouped by location. Zoom in to see individual markers
        with species and CO₂ data — exact GPS is never displayed.
      </p>
    </main>
  );
}
