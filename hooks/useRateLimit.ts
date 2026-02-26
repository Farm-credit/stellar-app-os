'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: string; // ISO timestamp
}

export interface RateLimitState {
  /** 0–100 */
  percentUsed: number;
  /** true when percentUsed >= 80 */
  isWarning: boolean;
  /** true when remaining === 0 */
  isBlocked: boolean;
  /** seconds until the rate limit resets; null if no resetAt */
  timeRemaining: number | null;
  /** formatted "mm:ss" string, or null */
  timeRemainingFormatted: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcSecondsRemaining(resetAt: string): number {
  const diff = Math.floor((new Date(resetAt).getTime() - Date.now()) / 1000);
  return Math.max(0, diff);
}

function formatMmSs(seconds: number): string {
  const mm = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const ss = (seconds % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useRateLimit
 *
 * Accepts a RateLimitInfo object (from API headers or response body) and
 * returns derived state + a live countdown that ticks every second.
 *
 * @example
 * const { isBlocked, isWarning, percentUsed, timeRemainingFormatted } =
 *   useRateLimit({ limit: 100, remaining: 15, resetAt: '2025-01-01T12:05:00Z' });
 */
export function useRateLimit(info: RateLimitInfo | null): RateLimitState {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [timeRemaining, setTimeRemaining] = useState<number | null>(() => {
    if (!info) return null;
    return calcSecondsRemaining(info.resetAt);
  });

  // Recalculate whenever the info changes (e.g. new API response)
  useEffect(() => {
    if (!info) {
      setTimeRemaining(null);
      return;
    }
    setTimeRemaining(calcSecondsRemaining(info.resetAt));
  }, [info]);

  // Tick every second
  useEffect(() => {
    if (!info) return;

    // Clear any existing interval first
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      setTimeRemaining(calcSecondsRemaining(info.resetAt));
    }, 1_000);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [info]);

  // Stop ticking once the timer reaches zero
  useEffect(() => {
    if (timeRemaining === 0 && intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [timeRemaining]);

  // Derived values
  if (!info) {
    return {
      percentUsed: 0,
      isWarning: false,
      isBlocked: false,
      timeRemaining: null,
      timeRemainingFormatted: null,
    };
  }

  const percentUsed =
    info.limit > 0
      ? Math.min(100, Math.round(((info.limit - info.remaining) / info.limit) * 100))
      : 0;

  const isBlocked = info.remaining === 0;
  const isWarning = !isBlocked && percentUsed >= 80;

  return {
    percentUsed,
    isWarning,
    isBlocked,
    timeRemaining,
    timeRemainingFormatted: timeRemaining !== null ? formatMmSs(timeRemaining) : null,
  };
}