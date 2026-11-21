'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Tracks which planters a sponsor has connected with / followed. State is
 * stored in localStorage so it survives reloads. This is the client-side
 * primitive that "enables sponsor-planter connections"; it can be swapped for
 * an API + Stellar identity later without changing the component API.
 */
const CONNECTIONS_STORAGE_KEY = 'farmcredit-planter-connections';

function readConnections(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CONNECTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeConnections(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable — ignore
  }
}

interface UsePlanterConnectionsReturn {
  connectedPlanterIds: string[];
  isConnected: (planterId: string) => boolean;
  toggleConnection: (planterId: string) => void;
  connect: (planterId: string) => void;
  removeConnection: (planterId: string) => void;
}

export function usePlanterConnections(): UsePlanterConnectionsReturn {
  const [connectedPlanterIds, setConnectedPlanterIds] = useState<string[]>([]);

  useEffect(() => {
    setConnectedPlanterIds(readConnections());
  }, []);

  const isConnected = useCallback(
    (planterId: string) => connectedPlanterIds.includes(planterId),
    [connectedPlanterIds]
  );

  const connect = useCallback((planterId: string) => {
    setConnectedPlanterIds((prev) => {
      if (prev.includes(planterId)) return prev;
      const next = [...prev, planterId];
      writeConnections(next);
      return next;
    });
  }, []);

  const removeConnection = useCallback((planterId: string) => {
    setConnectedPlanterIds((prev) => {
      const next = prev.filter((id) => id !== planterId);
      writeConnections(next);
      return next;
    });
  }, []);

  const toggleConnection = useCallback((planterId: string) => {
    setConnectedPlanterIds((prev) => {
      const next = prev.includes(planterId)
        ? prev.filter((id) => id !== planterId)
        : [...prev, planterId];
      writeConnections(next);
      return next;
    });
  }, []);

  return { connectedPlanterIds, isConnected, toggleConnection, connect, removeConnection };
}
