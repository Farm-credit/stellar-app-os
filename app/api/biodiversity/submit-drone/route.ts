/**
 * POST /api/biodiversity/submit-drone
 *
 * Accepts a signed drone survey observation from the field pipeline (#1155).
 * Drone observations include canopy cover %, NDVI, and visual fauna detections
 * from computer-vision classification of the image mosaic.
 *
 * Body: DroneObservation (see lib/types/biodiversity.ts)
 */

import { NextResponse } from 'next/server';
import type { DroneObservation } from '@/lib/types/biodiversity';
import { processDroneObservation } from '@/lib/biodiversity/biodiversity-oracle';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: DroneObservation;
  try {
    body = (await request.json()) as DroneObservation;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const result = processDroneObservation(body);

    return NextResponse.json(
      {
        verified: result.verified,
        flightId: result.observation.flightId,
        regionKey: result.observation.regionKey,
        surveyedAt: result.observation.surveyedAt,
        canopyCoverPercent: result.observation.canopyCoverPercent,
        ndviMean: result.observation.ndviMean,
        detectedFaunaCount: result.observation.detectedFauna.length,
        speciesEvents: result.speciesEvents,
      },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Submission failed';

    if (msg === 'BIODIVERSITY_ORACLE_SIGNATURE_INVALID') {
      return NextResponse.json({ error: 'ORACLE_SIGNATURE_INVALID' }, { status: 401 });
    }
    if (msg === 'BIODIVERSITY_ORACLE_PUBLIC_KEY_HEX environment variable not set') {
      return NextResponse.json({ error: 'ORACLE_NOT_CONFIGURED' }, { status: 503 });
    }

    console.error('[api/biodiversity/submit-drone] Error:', err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
