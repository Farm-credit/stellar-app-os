/**
 * GET /api/biodiversity/ecosystem-snapshot?regionKey=<key>&asOf=<date>
 *
 * Returns the latest ecosystem recovery snapshot for a monitored region (#1155).
 *
 * The composite recovery score (0–100) is computed from:
 *   - Acoustic complexity index (bioacoustic sensors)
 *   - Canopy cover % (drone surveys)
 *   - Mean NDVI (drone surveys)
 *   - New species detected since baseline (both methods)
 *
 * In production this would query a time-series DB table. This implementation
 * uses the recovery-score computation layer against representative aggregated
 * inputs, ready to be wired to real persistence.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { buildRecoverySnapshot } from '@/lib/biodiversity/recovery-score';
import type {
  GetEcosystemSnapshotResponse,
  SpeciesDetectionEvent,
} from '@/lib/types/biodiversity';

export const runtime = 'nodejs';

/**
 * Simulates fetching aggregated biodiversity metrics for a region.
 *
 * Replace this function body with a real DB/cache query once the
 * biodiversity_readings and species_events tables are migrated.
 */
function fetchRegionAggregates(regionKey: string, asOf: string) {
  // Placeholder aggregation — returns deterministic values derived from the
  // regionKey so tests remain reproducible without a database.
  const seed = regionKey.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const pseudo = (offset: number, max: number) => ((seed + offset) % (max * 10)) / 10;

  return {
    totalSpeciesCount: 12 + Math.floor(pseudo(1, 30)),
    baselineSpeciesCount: 5,
    threatenedSpeciesCount: 2 + Math.floor(pseudo(2, 5)),
    aciScore: 0.4 + pseudo(3, 5) / 10,
    canopyCoverPercent: 20 + pseudo(4, 50),
    ndviMean: 0.3 + pseudo(5, 4) / 10,
    lastUpdatedAt: asOf,
  };
}

/**
 * Simulates fetching recent species detection events for a region.
 * Replace with a real DB query filtered by region and date window.
 */
function fetchRecentSpeciesEvents(regionKey: string): SpeciesDetectionEvent[] {
  return [
    {
      species: 'African Grey Hornbill',
      taxonomyGroup: 'bird',
      firstDetectedAt: '2026-03-15T08:00:00Z',
      lastDetectedAt: '2026-08-20T07:30:00Z',
      method: 'bioacoustic',
      isIucnThreatened: false,
      iucnCategory: 'LC',
    },
    {
      species: 'Nile Monitor',
      taxonomyGroup: 'reptile',
      firstDetectedAt: '2026-04-02T14:00:00Z',
      lastDetectedAt: '2026-08-18T11:00:00Z',
      method: 'drone',
      isIucnThreatened: false,
      iucnCategory: 'LC',
    },
    {
      species: `${regionKey}-endemic-moth`,
      taxonomyGroup: 'insect',
      firstDetectedAt: '2026-06-01T00:00:00Z',
      lastDetectedAt: '2026-08-25T00:00:00Z',
      method: 'bioacoustic',
      isIucnThreatened: true,
      iucnCategory: 'VU',
    },
  ];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const regionKey = searchParams.get('regionKey');
  const asOf = searchParams.get('asOf') ?? new Date().toISOString().slice(0, 10);

  if (!regionKey || !regionKey.trim()) {
    return NextResponse.json(
      { error: 'regionKey query parameter is required' },
      { status: 400 }
    );
  }

  if (asOf && isNaN(new Date(asOf).getTime())) {
    return NextResponse.json(
      { error: 'asOf must be a valid ISO-8601 date string' },
      { status: 400 }
    );
  }

  try {
    const aggregates = fetchRegionAggregates(regionKey, new Date(asOf).toISOString());
    const snapshot = buildRecoverySnapshot({
      regionKey,
      snapshotDate: asOf,
      ...aggregates,
    });

    const recentSpeciesEvents = fetchRecentSpeciesEvents(regionKey);

    const response: GetEcosystemSnapshotResponse = {
      snapshot,
      recentSpeciesEvents,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error('[api/biodiversity/ecosystem-snapshot] Error:', err);
    const message = err instanceof Error ? err.message : 'Failed to fetch snapshot';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
