import { useState, useEffect, useCallback, useMemo } from 'react';

export type SeedBatchStatus =
  | 'collected'
  | 'processing'
  | 'stored'
  | 'distributed'
  | 'planted'
  | 'depleted';

export type SeedDistributionStatus =
  | 'pending'
  | 'in_transit'
  | 'received'
  | 'planted'
  | 'cancelled';

export interface SeedBatch {
  id: string;
  batchCode: string;
  species: string;
  scientificName?: string;
  seedBankId: string;
  seedBankName?: string;
  collectionSiteId?: string;
  collectionSiteName?: string;
  collectedBy?: string;
  collectedAt: string;
  quantity: number;
  quantityUnit: string;
  status: SeedBatchStatus;
  provenanceNotes?: string;
  storageLocation?: string;
  germinationRate?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SeedDistribution {
  id: string;
  batchId: string;
  batchCode?: string;
  species?: string;
  nurseryId?: string;
  nurseryName?: string;
  plantingSiteId?: string;
  plantingSiteName?: string;
  treeProfileId?: string;
  quantity: number;
  quantityUnit: string;
  status: SeedDistributionStatus;
  distributedAt?: string;
  receivedAt?: string;
  plantedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SeedBankInventorySummary {
  totalBatches: number;
  totalQuantity: number;
  byStatus: Record<SeedBatchStatus, number>;
  bySpecies: Record<string, number>;
  activeDistributions: number;
}

export interface UseSeedBatchesOptions {
  seedBankId?: string;
  species?: string;
  status?: SeedBatchStatus;
  treeProfileId?: string;
  autoFetch?: boolean;
}

export interface UseSeedBatchesResult {
  batches: SeedBatch[];
  distributions: SeedDistribution[];
  summary: SeedBankInventorySummary;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  transitionBatchStatus: (batchId: string, status: SeedBatchStatus) => Promise<SeedBatch | null>;
  transitionDistributionStatus: (
    distributionId: string,
    status: SeedDistributionStatus
  ) => Promise<SeedDistribution | null>;
  getBatchesForTreeProfile: (treeProfileId: string) => SeedDistribution[];
  getDistributionsForBatch: (batchId: string) => SeedDistribution[];
}

const EMPTY_SUMMARY: SeedBankInventorySummary = {
  totalBatches: 0,
  totalQuantity: 0,
  byStatus: {
    collected: 0,
    processing: 0,
    stored: 0,
    distributed: 0,
    planted: 0,
    depleted: 0,
  },
  bySpecies: {},
  activeDistributions: 0,
};

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, value);
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function parseError(response: Response): Promise<Error> {
  try {
    const body = await response.json();
    if (body && typeof body.message === 'string') {
      return new Error(body.message);
    }
  } catch {
    // ignore parse failures
  }
  return new Error(`Request failed with status ${response.status}`);
}

export function useSeedBatches(options: UseSeedBatchesOptions = {}): UseSeedBatchesResult {
  const { seedBankId, species, status, treeProfileId, autoFetch = true } = options;

  const [batches, setBatches] = useState<SeedBatch[]>([]);
  const [distributions, setDistributions] = useState<SeedDistribution[]>([]);
  const [loading, setLoading] = useState<boolean>(autoFetch);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const batchQuery = buildQuery({ seedBankId, species, status });
      const distributionQuery = buildQuery({ seedBankId, treeProfileId });

      const [batchesResponse, distributionsResponse] = await Promise.all([
        fetch(`/api/seed-batches${batchQuery}`),
        fetch(`/api/seed-distributions${distributionQuery}`),
      ]);

      if (!batchesResponse.ok) {
        throw await parseError(batchesResponse);
      }
      if (!distributionsResponse.ok) {
        throw await parseError(distributionsResponse);
      }

      const batchesData = (await batchesResponse.json()) as SeedBatch[];
      const distributionsData = (await distributionsResponse.json()) as SeedDistribution[];

      setBatches(Array.isArray(batchesData) ? batchesData : []);
      setDistributions(Array.isArray(distributionsData) ? distributionsData : []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load seed batches'));
    } finally {
      setLoading(false);
    }
  }, [seedBankId, species, status, treeProfileId]);

  useEffect(() => {
    if (autoFetch) {
      void fetchData();
    }
  }, [autoFetch, fetchData]);

  const transitionBatchStatus = useCallback(
    async (batchId: string, nextStatus: SeedBatchStatus): Promise<SeedBatch | null> => {
      setError(null);
      try {
        const response = await fetch(`/api/seed-batches/${batchId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        });

        if (!response.ok) {
          throw await parseError(response);
        }

        const updated = (await response.json()) as SeedBatch;
        setBatches((prev) => prev.map((batch) => (batch.id === batchId ? updated : batch)));
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update seed batch status'));
        return null;
      }
    },
    []
  );

  const transitionDistributionStatus = useCallback(
    async (
      distributionId: string,
      nextStatus: SeedDistributionStatus
    ): Promise<SeedDistribution | null> => {
      setError(null);
      try {
        const response = await fetch(`/api/seed-distributions/${distributionId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        });

        if (!response.ok) {
          throw await parseError(response);
        }

        const updated = (await response.json()) as SeedDistribution;
        setDistributions((prev) =>
          prev.map((distribution) =>
            distribution.id === distributionId ? updated : distribution
          )
        );
        return updated;
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to update seed distribution status')
        );
        return null;
      }
    },
    []
  );

  const getBatchesForTreeProfile = useCallback(
    (profileId: string): SeedDistribution[] =>
      distributions.filter((distribution) => distribution.treeProfileId === profileId),
    [distributions]
  );

  const getDistributionsForBatch = useCallback(
    (batchId: string): SeedDistribution[] =>
      distributions.filter((distribution) => distribution.batchId === batchId),
    [distributions]
  );

  const summary = useMemo<SeedBankInventorySummary>(() => {
    if (batches.length === 0 && distributions.length === 0) {
      return EMPTY_SUMMARY;
    }

    const byStatus: Record<SeedBatchStatus, number> = {
      collected: 0,
      processing: 0,
      stored: 0,
      distributed: 0,
      planted: 0,
      depleted: 0,
    };
    const bySpecies: Record<string, number> = {};
    let totalQuantity = 0;

    batches.forEach((batch) => {
      totalQuantity += batch.quantity || 0;
      if (batch.status in byStatus) {
        byStatus[batch.status] += 1;
      }
      const speciesKey = batch.species || 'unknown';
      bySpecies[speciesKey] = (bySpecies[speciesKey] || 0) + (batch.quantity || 0);
    });

    const activeDistributions = distributions.filter(
      (distribution) =>
        distribution.status === 'pending' || distribution.status === 'in_transit'
    ).length;

    return {
      totalBatches: batches.length,
      totalQuantity,
      byStatus,
      bySpecies,
      activeDistributions,
    };
  }, [batches, distributions]);

  return {
    batches,
    distributions,
    summary,
    loading,
    error,
    refetch: fetchData,
    transitionBatchStatus,
    transitionDistributionStatus,
    getBatchesForTreeProfile,
    getDistributionsForBatch,
  };
}

export default useSeedBatches;