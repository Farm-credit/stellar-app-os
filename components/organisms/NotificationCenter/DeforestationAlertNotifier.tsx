'use client';

/**
 * DeforestationAlertNotifier — Issue #672
 *
 * Bridges server-recorded deforestation alerts into the in-app notification
 * centre: polls `GET /api/deforestation/alerts` on mount and every minute,
 * announces each alert once per browser (localStorage), and pops a toast so
 * project managers notice immediately. Renders nothing.
 */

import { useEffect, useRef } from 'react';

import { useNotification } from '@/contexts/NotificationContext';
import { alertToNotification } from '@/lib/deforestation/notify';
import type { DeforestationAlert } from '@/lib/deforestation/types';

const POLL_INTERVAL_MS = 60_000;
const STORAGE_KEY = 'deforestation-alerts-seen';

function readSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    // Storage unavailable — the alert is simply announced again next visit.
  }
}

export function DeforestationAlertNotifier(): null {
  const { addNotification, addToast } = useNotification();
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<void> {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const response = await fetch('/api/deforestation/alerts');
        if (!response.ok) return;

        const data = (await response.json()) as { alerts?: DeforestationAlert[] };
        if (cancelled || !Array.isArray(data.alerts)) return;

        const seen = readSeen();
        const fresh = data.alerts.filter((alert) => !seen.has(alert.id));
        if (fresh.length === 0) return;

        for (const alert of fresh) {
          addNotification(alertToNotification(alert, (url) => window.open(url, '_blank')));
          seen.add(alert.id);
        }
        addToast({
          type: 'warning',
          title:
            fresh.length === 1
              ? `Deforestation alert: ${fresh[0].projectName}`
              : `${fresh.length} new deforestation alerts`,
          description: 'Open your notifications to review the affected areas.',
        });
        writeSeen(seen);
      } catch {
        // Alert announcements are best-effort.
      } finally {
        inFlight.current = false;
      }
    }

    void check();
    const timer = setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [addNotification, addToast]);

  return null;
}
