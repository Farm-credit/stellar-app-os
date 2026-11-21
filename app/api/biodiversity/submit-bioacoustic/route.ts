/**
 * POST /api/biodiversity/submit-bioacoustic
 *
 * Accepts a signed bioacoustic sensor reading from the field network (#1155).
 * Verifies the oracle signature before accepting the data, following the same
 * trust model as /api/oracle/submit-ndvi.
 *
 * Body: BioacousticReading (see lib/types/biodiversity.ts)
 */

import { NextResponse } from 'next/server';
import type { BioacousticReading } from '@/lib/types/biodiversity';
import { processBioacousticReading } from '@/lib/biodiversity/biodiversity-oracle';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: BioacousticReading;
  try {
    body = (await request.json()) as BioacousticReading;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const result = processBioacousticReading(body);

    return NextResponse.json(
      {
        verified: result.verified,
        deviceId: result.reading.deviceId,
        regionKey: result.reading.regionKey,
        recordedAt: result.reading.recordedAt,
        aciScore: result.reading.aciScore,
        detectedSpeciesCount: result.reading.detectedSpecies.length,
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

    console.error('[api/biodiversity/submit-bioacoustic] Error:', err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
