'use client';

import { useState, useEffect, useCallback } from 'react';
import { mockFarmerDashboard } from '@/lib/api/mock/farmerDashboard';
import type { FarmerDashboardData } from '@/types/farmer-dashboard';

export function useFarmerDashboard(_farmerId?: string) {
  const [data, setData] = useState<FarmerDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Simulate network latency; swap for real API call when available
      await new Promise((r) => setTimeout(r, 600));
      setData(mockFarmerDashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, retry: fetchData };
}
