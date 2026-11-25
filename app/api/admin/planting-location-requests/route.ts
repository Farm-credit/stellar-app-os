import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import {
  getAvailablePlantingZones,
  listLocationRequests,
  suggestMatchingZones,
  type LocationRequestStatus,
} from '@/lib/planting-location-requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set<LocationRequestStatus | 'all'>([
  'all',
  'pending',
  'confirmed',
  'alternative_assigned',
]);

/**
 * GET /api/admin/planting-location-requests
 *
 * Lists sponsor planting location requests for admin review, along with
 * available planting zones and ranked zone match suggestions per request.
 */
export async function GET(request: Request) {
  const isAdmin = await isAdminRequest();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const statusParam = (searchParams.get('status') || 'all') as LocationRequestStatus | 'all';
    const status = VALID_STATUSES.has(statusParam) ? statusParam : 'all';
    const search = searchParams.get('search')?.trim() || undefined;

    const [requests, availableZones] = await Promise.all([
      listLocationRequests({ status, search }),
      getAvailablePlantingZones(),
    ]);

    const items = requests.map((req) => ({
      ...req,
      suggestions: suggestMatchingZones(
        req.preferredRegion,
        req.preferredCountry,
        req.treeCount,
        availableZones
      ),
    }));

    const summary = {
      total: requests.length,
      pending: requests.filter((r) => r.status === 'pending').length,
      confirmed: requests.filter((r) => r.status === 'confirmed').length,
      alternativeAssigned: requests.filter((r) => r.status === 'alternative_assigned').length,
    };

    return NextResponse.json({
      requests: items,
      availableZones,
      summary,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load planting location requests';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
