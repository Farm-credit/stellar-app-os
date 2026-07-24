'use client';

import { useState, useEffect, useCallback } from 'react';
import { mockFarmerDashboard } from '@/lib/api/mock/farmerDashboard';
import type { FarmerDashboardData } from '@/types/farmer-dashboard';

export function useFarmerDashboard(_farmerId?: string) {
  const [data, setData] = useState<FarmerDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setData(mockFarmerDashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const acceptJob = useCallback(
    async (assignment: {
      assignmentId: string;
      planterAddress?: string;
      planterName?: string;
      species: string;
      sponsorEmail: string;
      sponsorName: string;
    }): Promise<{ success: boolean; message: string; txHash?: string | null }> => {
      setAcceptingId(assignment.assignmentId);
      setError(null);
      try {
        const res = await fetch('/api/planting/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(assignment),
        });
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body.error ?? 'Failed to accept job');
        }
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            nextAssignments: prev.nextAssignments.map((a) =>
              a.id === assignment.assignmentId ? { ...a, status: 'in_progress' as const } : a
            ),
          };
        });
        return { success: true, message: body.message, txHash: body.txHash };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to accept job';
        setError(msg);
        return { success: false, message: msg };
      } finally {
        setAcceptingId(null);
      }
    },
    []
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, retry: fetchData, acceptJob, acceptingId };
}
