'use client';

import { useEffect, useRef } from 'react';
import { useNotification } from '@/contexts/NotificationContext';
import { useWalletContext } from '@/contexts/WalletContext';

/**
 * Payload returned by GET /api/species/conservation-alerts (Issue #1657).
 */
interface ConservationAlert {
  id: string;
  speciesSlug: string;
  commonName: string;
  scientificName: string;
  changeKind: 'newly_listed' | 'upgraded';
  previousStatusCode: string | null;
  newStatusCode: string;
  statusLabel: string;
  populationTrend: string | null;
  treeCount: number;
  checkQuarter: string;
  priority: 'medium' | 'high';
  educationUrl: string;
  createdAt: string;
}

interface ConservationAlertsResponse {
  success: boolean;
  alerts?: ConservationAlert[];
}

const storageKey = (address: string) => `species-conservation-alerts-seen:${address}`;

function readSeen(address: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(address));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(address: string, seen: Set<string>): void {
  try {
    window.localStorage.setItem(storageKey(address), JSON.stringify([...seen]));
  } catch {
    // Storage can be unavailable; the alert is simply announced again next time.
  }
}

function buildTitle(alert: ConservationAlert): string {
  return alert.changeKind === 'upgraded'
    ? `${alert.commonName} upgraded to ${alert.statusLabel}`
    : `${alert.commonName} newly listed as ${alert.statusLabel}`;
}

function buildDescription(alert: ConservationAlert): string {
  const trees = `${alert.treeCount} ${alert.treeCount === 1 ? 'tree' : 'trees'}`;
  if (alert.changeKind === 'upgraded') {
    return `${alert.scientificName} moved from ${alert.previousStatusCode} to ${alert.newStatusCode} (${alert.statusLabel}). You sponsor ${trees} of this species.`;
  }
  return `${alert.scientificName} is listed as ${alert.statusLabel} (${alert.newStatusCode}) on the IUCN Red List. You sponsor ${trees} of this species.`;
}

/**
 * Surfaces IUCN Red List status changes for the connected sponsor's trees as
 * in-app notifications with conservation context, and links to the species
 * education page. Mirrors SponsorBadgeNotifier: one fetch per wallet on load,
 * de-duplicated through localStorage. Renders nothing.
 */
export function SpeciesConservationNotifier(): null {
  const { wallet } = useWalletContext();
  const { addNotification, addToast } = useNotification();
  const checkedFor = useRef<string | null>(null);
  const address = wallet?.isConnected ? wallet.publicKey : null;

  useEffect(() => {
    if (!address || checkedFor.current === address) return;
    checkedFor.current = address;
    let cancelled = false;

    async function announce(sponsor: string) {
      try {
        const response = await fetch(
          `/api/species/conservation-alerts?wallet=${encodeURIComponent(sponsor)}`
        );
        if (!response.ok) return;

        const data = (await response.json()) as ConservationAlertsResponse;
        if (cancelled || !data.success || !Array.isArray(data.alerts)) return;

        const seen = readSeen(sponsor);
        const fresh = data.alerts.filter((alert) => !seen.has(alert.id));
        if (fresh.length === 0) return;

        for (const alert of fresh) {
          addNotification({
            title: buildTitle(alert),
            description: buildDescription(alert),
            type: 'species_conservation_alert',
            priority: alert.priority,
            metadata: {
              species: alert.scientificName,
              category: `${alert.statusLabel} (${alert.newStatusCode})`,
              populationTrend: alert.populationTrend ?? 'Unknown',
              trees: alert.treeCount,
              checkQuarter: alert.checkQuarter,
            },
            action: {
              label: 'Learn more',
              onClick: () => window.open(alert.educationUrl, '_blank'),
              variant: 'primary',
            },
          });
          seen.add(alert.id);
        }

        addToast({
          type: 'warning',
          title: fresh.length === 1 ? buildTitle(fresh[0]) : `${fresh.length} conservation updates`,
          description: 'Open your notifications to read the conservation context.',
        });

        writeSeen(sponsor, seen);
      } catch {
        // Conservation announcements are best-effort.
      }
    }

    void announce(address);
    return () => {
      cancelled = true;
      checkedFor.current = null;
    };
  }, [address, addNotification, addToast]);

  return null;
}
