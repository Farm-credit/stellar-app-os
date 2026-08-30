/**
 * GET /api/impact/:sponsor
 *
 * Returns the total CO2 offset, tree count, and per-species breakdown for a
 * given Stellar sponsor address by querying the CarbonCredits contract state.
 * Results are cached server-side for 30 seconds.
 *
 * Path params:
 *   sponsor  — Stellar public key (G… 56-char base32)
 * Query params:
 *   status   — optional; one of All, Pending, Planted, Verified, Failed
 *
 * Query params (optional):
 *   lat, lon — approximate user coordinates. When provided, each tree in the
 *              response gets a `distanceKm` field (approximate great-circle
 *              distance from the supplied point to the tree location).
 *
 * Responses:
 *   200  SponsorImpact JSON
 *   400  { error: "Invalid Stellar address" } or { error: "Invalid coordinates" }
 *   500  { error: string }
 *
 * Closes #545
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getSponsorImpact, isValidStellarAddress } from '@/lib/api/carbon-impact';

export const runtime = 'nodejs';

const EARTH_RADIUS_KM = 6371;
const toRad = (value: number) => (value * Math.PI) / 180;

function isValidLatitude(lat: number | null): lat is number {
  return lat !== null && !Number.isNaN(lat) && lat >= -90 && lat <= 90;
}

function isValidLongitude(lon: number | null): lon is number {
  return lon !== null && !Number.isNaN(lon) && lon >= -180 && lon <= 180;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sponsor: string }> }
) {
  try {
    const { sponsor: rawSponsor } = await params;
    const sponsor = rawSponsor?.trim() ?? '';

    if (!sponsor) {
      return NextResponse.json({ error: 'sponsor address is required' }, { status: 400 });
    }

    if (!isValidStellarAddress(sponsor)) {
      return NextResponse.json(
        { error: 'Invalid Stellar address — must be a 56-character G… public key' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const latParam = searchParams.get('lat');
    const lonParam = searchParams.get('lon');
    const lat = latParam === null ? null : Number(latParam);
    const lon = lonParam === null ? null : Number(lonParam);

    if ((latParam !== null || lonParam !== null) && (!isValidLatitude(lat) || !isValidLongitude(lon))) {
      return NextResponse.json(
        { error: 'Invalid coordinates — lat must be in [-90, 90] and lon in [-180, 180]' },
        { status: 400 }
      );
    }

    const requestedStatus = request.nextUrl.searchParams.get('status');
    const rawStatus = requestedStatus?.trim() ?? '';

    const allowedStatuses = new Set(['all', 'pending', 'planted', 'verified', 'failed']);
    if (rawStatus && !allowedStatuses.has(rawStatus.toLowerCase())) {
      return NextResponse.json(
        { error: 'Invalid status filter — must be one of: All, Pending, Planted, Verified, Failed' },
        { status: 400 }
      );
    }

    const filterStatus = rawStatus.toLowerCase() === 'all' ? '' : rawStatus.toLowerCase();
    const impact = filterStatus
      ? await getSponsorImpact(sponsor, filterStatus)
      : await getSponsorImpact(sponsor);

    const impactWithOptionalGeo = impact as typeof impact & {
      trees?: Array<Record<string, any>>;
      location?: { lat?: number; lon?: number };
      distanceKm?: number;
    };

    if (lat !== null && lon !== null) {
      if (Array.isArray(impactWithOptionalGeo.trees)) {
        impactWithOptionalGeo.trees = impactWithOptionalGeo.trees.map((tree: Record<string, any>) => {
          if (tree?.location?.lat != null && tree?.location?.lon != null) {
            return {
              ...tree,
              distanceKm: haversineDistance(lat, lon, tree.location.lat, tree.location.lon),
            };
          }
          return tree;
        });
      }
      if (impactWithOptionalGeo.location?.lat != null && impactWithOptionalGeo.location?.lon != null) {
        impactWithOptionalGeo.distanceKm = haversineDistance(
          lat,
          lon,
          impactWithOptionalGeo.location.lat,
          impactWithOptionalGeo.location.lon
        );
      }
    }

    const responseBody = {
      ...impact,
      ...impactWithOptionalGeo,
    };

    return NextResponse.json(responseBody, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=10',
        'X-Cached-At': impact.cachedAt,
      },
    });
  } catch (err) {
    console.error('[api/impact/:sponsor] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
