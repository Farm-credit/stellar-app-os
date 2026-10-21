'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchTrees } from '@/lib/api/trees';
import type { Tree, TreeFilterState, TreeSpecies, TreeStatus } from '@/lib/types/tree';

export type WaitlistStatus = 'waiting' | 'assigned' | 'cancelled';

export interface WaitlistEntry {
  id: string;
  region: string;
  treeId?: string;
  position: number;
  estimatedWait: string;
  status: WaitlistStatus;
  joinedAt: string;
}

interface WaitlistResponse {
  entries: WaitlistEntry[];
}

async function fetchWaitlist(): Promise<WaitlistResponse> {
  const response = await fetch('/api/sponsors/waitlist', {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error('Failed to load waitlist');
  }
  return (await response.json()) as WaitlistResponse;
}

async function postJoinWaitlist(region: string, treeId?: string): Promise<WaitlistEntry> {
  const response = await fetch('/api/sponsors/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ region, treeId }),
  });
  if (!response.ok) {
    throw new Error('Failed to join waitlist');
  }
  return (await response.json()) as WaitlistEntry;
}

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

export function useWaitlist() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchWaitlist();
      setEntries(response.entries);
    } catch {
      setError('Failed to load your waitlist. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const joinWaitlist = useCallback(
    async (region: string, treeId?: string) => {
      setIsJoining(true);
      setError(null);
      try {
        const entry = await postJoinWaitlist(region, treeId);
        setEntries((prev) => {
          const withoutDuplicate = prev.filter(
            (existing) => existing.id !== entry.id && existing.region !== entry.region,
          );
          return [...withoutDuplicate, entry].sort((a, b) => a.position - b.position);
        });
        return entry;
      } catch {
        setError('Failed to join the waitlist. Please try again.');
        return null;
      } finally {
        setIsJoining(false);
      }
    },
    [],
  );

  const activeEntry = useMemo(
    () => entries.find((entry) => entry.status === 'waiting') ?? null,
    [entries],
  );

  return {
    entries,
    activeEntry,
    position: activeEntry?.position ?? null,
    estimatedWait: activeEntry?.estimatedWait ?? null,
    status: activeEntry?.status ?? null,
    isLoading,
    isJoining,
    error,
    joinWaitlist,
    refresh,
  };
}
