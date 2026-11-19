'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchTrees } from '@/lib/api/trees';
import type { Tree, TreeFilterState, TreeSpecies, TreeStatus } from '@/lib/types/tree';

const DEFAULT_FILTERS: TreeFilterState = {
  search: '',
  species: 'all',
  region: 'all',
  status: 'all',
};

export function useSponsorTrees(initialFilters: Partial<TreeFilterState> = {}) {
  const [filters, setFilters] = useState<TreeFilterState>({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  });
  const [trees, setTrees] = useState<Tree[]>([]);
  const [speciesOptions, setSpeciesOptions] = useState<TreeSpecies[]>([]);
  const [regionOptions, setRegionOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<TreeStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTrees = useCallback(async (nextFilters: TreeFilterState) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchTrees(nextFilters);
      setTrees(response.trees);
      setSpeciesOptions(response.speciesOptions);
      setRegionOptions(response.regionOptions);
      setStatusOptions(response.statusOptions);
    } catch {
      setError('Failed to load your trees. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTrees(filters);
  }, [filters, loadTrees]);

  const updateFilters = useCallback((partial: Partial<TreeFilterState>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  }, []);

  const totalCount = useMemo(() => trees.length, [trees]);

  return {
    trees,
    filters,
    speciesOptions,
    regionOptions,
    statusOptions,
    totalCount,
    isLoading,
    error,
    updateFilters,
    setFilters,
  };
}
