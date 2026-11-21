'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAffiliateProgram } from '@/lib/affiliate';
import type { AffiliateProgramInfo } from '@/lib/types/affiliate';

interface UseAffiliateProgramReturn {
  data: AffiliateProgramInfo | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useAffiliateProgram(): UseAffiliateProgramReturn {
  const [data, setData] = useState<AffiliateProgramInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAffiliateProgram();
      setData(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load affiliate program');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = useCallback(() => {
    void load();
  }, [load]);

  return { data, loading, error, retry };
}
