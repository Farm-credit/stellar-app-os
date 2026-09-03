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
 *   status   ℔ optional; one of All, Pending, Planted, Verified, Failed
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
import Stripe from 'stripe';
import { isValidStellarAddress, listBySponsor } from '@/lib/api/carbon-impact';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface Tree {
  species?: string;
  co2Offset?: number;
  status?: string;
  location?: {
    lat: number | null;
    lon: number | null;
  };
  distanceKm?: number;
}

interface SponsorImpact {
  totalCo2Offset: number;
  treeCount: number;
  perSpecies: Record<string, number>;
  cachedAt: string;
  trees?: Tree[];
  location?: {
    lat: number | null;
    lon: number | null;
  };
  distanceKm?: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (value: number) => (value * Math.PI) / 180;

function isValidLatitude(lat: number | null): lat is number {
  return lat !== null && !Number.isNaN(lat) && lat >= -90 && lat <= 90;
}

function isValidLongitude(lon: number | null): lon is number {
  return lon !== null && !Number.isNaN(lon) && lon >= -180 && lon <= 180;
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) **2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) **2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

async function getXlmPriceInUsd(): Promise<number> {
  const fallbackRate = 0.12; // $0.12 per XLM
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd'
    );
    const data = await response.json();
    return data.stellar?.usd ?? fallbackRate;
  } catch {
    return fallbackRate;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sponsor: string }> }
) {
  try {
    const { sponsor: rawSponsor } = await params;
    const sponsor = rawSponsor?.trim() || '';

    if (!sponsor) {
      return NextResponse.json({ error: 'sponsor address is required' }, { status: 400 });
    }

    if (!isValidStellarAddress(sponsor)) {
      return NextResponse.json(
        { error: 'Invalid Stellar address — must be a 56-character G․ public key' },
        { status: 400 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
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

    const rawStatus = searchParams.get('status')?.trim() ?? '';

    const allowedStatuses = new Set(['all', 'pending', 'planted', 'verified', 'failed']);
    if (rawStatus && !allowedStatuses.has(rawStatus.toLowerCase())) {
      return NextResponse.json(
        { error: 'Invalid status filter — must be one of: All, Pending, Planted, Verified, Failed' },
        { status: 400 }
      );
    }

    const filterStatus = rawStatus.toLowerCase() === 'all' ? '' : rawStatus.toLowerCase();

    // Aggregate all trees for the sponsor, handling pagination for large datasets.
    let cursor: string | null = null;
    const trees: Tree[] = [];
    const perSpecies: Record<string, number> = {};
    let totalCo2Offset = 0;
    let treeCount = 0;

    do {
      const page = await listBySponsor(sponsor, cursor);
      for (const tree of page.trees ?? []) {
        const treeItem = tree as Tree;
        if (filterStatus && treeItem.status?.toLowerCase() !== filterStatus) {
          continue;
        }
        trees.push(treeItem);
        treeCount += 1;
        totalCo2Offset += treeItem.co2Offset ?? 0;
        const species = treeItem.species ?? 'Unknown';
        perSpecies[species] = (perSpecies[species] ?? 0) + 1;
      }
      cursor = page.nextCursor ?? null;
    } while (cursor);

    const impact: SponsorImpact = {
      totalCo2Offset,
      treeCount,
      perSpecies,
      cachedAt: new Date().toISOString(),
      trees,
    };

    if (lat !== null && lon !== null) {
      if (Array.isArray(impact.trees)) {
        impact.trees = impact.trees.map((tree: any) => {
          if (tree?.location?.lat != null && tree?.location?.lon != null) {
            return {
              ...tree,
              distanceKm: haversineDistance(lat, lon, tree.location.lat, tree.location.lon),
            };
          }
          return tree;
        });
      }
      if (impact?.location?.lat != null && impact?.location?.lon != null) {
        impact.distanceKm = haversineDistance(lat, lon, impact.location.lat, impact.location.lon);
      }
    }

    return NextResponse.json(impact, {
      headers: {
        'Cache-Control': 'public, smaxage=30, stale-while-revalidate=10',
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sponsor: string }> }
) {
  try {
    const { sponsor: rawSponsor } = await params;
    const sponsor = rawSponsor?.trim() || '';

    if (!sponsor || !isValidStellarAddress(sponsor)) {
      return NextResponse.json(
        { error: 'Invalid Stellar address' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { amount, paymentMethodId } = body || {};

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount — must be a positive number' },
        { status: 400 }
      );
    }

    if (!paymentMethodId || typeof paymentMethodId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid paymentMethodId' },
        { status: 400 }
      );
    }

    const xlmPriceUsd = await getXlmPriceInUsd();
    const xlmAmount = amount / xlmPriceUsd;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe expects cents
      currency: 'usd',
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true },
      metadata: {
        sponsor,
        xmlAmount: xlmAmount.toFixed(7),
      },
    });

    // TODO: After successful payment, settle the CarbonCredits contract
    // with the XLM amount. This is a stub for the integration.
    console.log(
      `Payment ${paymentIntent.id} for sponsor ${sponsor} succeeded. ` +
      `Would send ${xlmAmount.toFixed(7)} XLM to contract.`
    );

    return NextResponse.json({
      success: true,
      paymentIntentId: paymentIntent.id,
      sponsor,
      xlmAmount,
      xlmPriceUsd,
    }, { status: 201 });
  } catch (error) {
    console.error('[api/impact/:sponsor] payment error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Payment failed' },
      { status: 500 }
    );
  }
}