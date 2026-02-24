'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type {
  AnalyticsDataset,
  AnalyticsDateRange,
  UseAnalyticsDataReturn,
} from '@/lib/types/analytics';
import { generateMockAnalyticsData, buildDefaultDateRange } from '@/lib/api/mock/analyticsData';

const POLL_INTERVAL = 5000;

export function useAnalyticsData(): UseAnalyticsDataReturn {
  const [dataset, setDataset] = useState<AnalyticsDataset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [dateRange, setDateRangeState] = useState<AnalyticsDateRange>(() =>
    buildDefaultDateRange(30)
  );

  // Keep refs in sync so callbacks never go stale
  const dateRangeRef = useRef<AnalyticsDateRange>(dateRange);
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    dateRangeRef.current = dateRange;
  }, [dateRange]);

  const loadData = useCallback((range: AnalyticsDateRange) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = generateMockAnalyticsData(range);
      setDataset(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      loadData(dateRangeRef.current);
    }, POLL_INTERVAL);
  }, [loadData]);

  useEffect(() => {
    // Initial load
    loadData(dateRangeRef.current);

    const wsUrl = process.env.NEXT_PUBLIC_ANALYTICS_WS_URL;

    if (wsUrl) {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsLive(true);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const incoming = JSON.parse(event.data as string) as AnalyticsDataset;
          setDataset(incoming);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        setIsLive(false);
        startPolling();
      };

      ws.onclose = () => {
        setIsLive(false);
        startPolling();
      };
    } else {
      startPolling();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDateRange = useCallback(
    (range: AnalyticsDateRange) => {
      setDateRangeState(range);
      dateRangeRef.current = range;
      loadData(range);
    },
    [loadData]
  );

  const refresh = useCallback(() => {
    loadData(dateRangeRef.current);
  }, [loadData]);

  return {
    dataset,
    isLoading,
    error,
    isLive,
    dateRange,
    setDateRange,
    refresh,
  };
}
