/**
 * GET /api/trees/search
 *
 * Search and filter registered trees across species, regions, life-cycle statuses,
 * planters, CO2 thresholds, and planting date ranges with configurable sorting
 * and full metadata pagination.
 *
 * Query parameters:
 *   q             — free-text search across tree ID, species, region, planter, project name
 *   species       — filter by species (Teak | Moringa | Eucalyptus | Mangrove | Mahogany | Bamboo | Acacia | all)
 *   region        — filter by region string or "all"
 *   status        — filter by status (funded | planted | verified | completed | failed | all)
 *   planterId     — filter by planter wallet address
 *   minCo2        — minimum CO2 offset in kg
 *   maxCo2        — maximum CO2 offset in kg
 *   plantedAfter  — ISO 8601 start date
 *   plantedBefore — ISO 8601 end date
 *   sortBy        — sort field (createdAt | co2Offset | treeId | species | status)
 *   sortOrder     — sort direction (asc | desc)
 *   limit         — max results (default 50, max 200)
 *   offset        — pagination offset (default 0)
 *
 * Closes #1181
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getTreeList } from '@/lib/api/tree-registry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;

    const q = p.get('q') ?? p.get('search') ?? undefined;
    const species = p.get('species') ?? undefined;
    const region = p.get('region') ?? undefined;
    const status = p.get('status') ?? undefined;
    const planterId = p.get('planterId') ?? undefined;
    const minCo2 = p.has('minCo2') ? parseFloat(p.get('minCo2')!) : undefined;
    const maxCo2 = p.has('maxCo2') ? parseFloat(p.get('maxCo2')!) : undefined;
    const plantedAfter = p.get('plantedAfter') ?? undefined;
    const plantedBefore = p.get('plantedBefore') ?? undefined;
    const sortBy = p.get('sortBy') ?? 'createdAt';
    const sortOrder = (p.get('sortOrder') ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const limit = Math.min(Math.max(p.has('limit') ? parseInt(p.get('limit')!, 10) : 50, 1), 200);
    const offset = Math.max(p.has('offset') ? parseInt(p.get('offset')!, 10) : 0, 0);

    const baseResult = await getTreeList({
      species,
      region,
      status,
      search: q,
      limit: 200, // Fetch pool for advanced client filtering
      offset: 0,
    });

    let filtered = baseResult.trees ?? [];

    if (planterId) {
      filtered = filtered.filter(
        (tree) => tree.planter?.toLowerCase() === planterId.toLowerCase()
      );
    }

    if (minCo2 !== undefined && !isNaN(minCo2)) {
      filtered = filtered.filter((tree) => (tree.co2Offset ?? 0) >= minCo2);
    }

    if (maxCo2 !== undefined && !isNaN(maxCo2)) {
      filtered = filtered.filter((tree) => (tree.co2Offset ?? 0) <= maxCo2);
    }

    if (plantedAfter) {
      const afterTime = new Date(plantedAfter).getTime();
      if (!isNaN(afterTime)) {
        filtered = filtered.filter(
          (tree) => new Date(tree.plantedAt || tree.createdAt).getTime() >= afterTime
        );
      }
    }

    if (plantedBefore) {
      const beforeTime = new Date(plantedBefore).getTime();
      if (!isNaN(beforeTime)) {
        filtered = filtered.filter(
          (tree) => new Date(tree.plantedAt || tree.createdAt).getTime() <= beforeTime
        );
      }
    }

    // Sorting
    filtered.sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      if (sortBy === 'co2Offset') {
        valA = a.co2Offset ?? 0;
        valB = b.co2Offset ?? 0;
      } else if (sortBy === 'treeId') {
        valA = a.id ?? '';
        valB = b.id ?? '';
      } else if (sortBy === 'species') {
        valA = a.species ?? '';
        valB = b.species ?? '';
      } else if (sortBy === 'status') {
        valA = a.status ?? '';
        valB = b.status ?? '';
      } else {
        valA = new Date(a.createdAt ?? 0).getTime();
        valB = new Date(b.createdAt ?? 0).getTime();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const total = filtered.length;
    const paginatedTrees = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < total;
    const page = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit) || 1;

    const responsePayload = {
      trees: paginatedTrees,
      pagination: {
        total,
        limit,
        offset,
        hasMore,
        page,
        totalPages,
      },
      filtersApplied: {
        ...(q && { q }),
        ...(species && { species }),
        ...(region && { region }),
        ...(status && { status }),
        ...(planterId && { planterId }),
        ...(minCo2 !== undefined && { minCo2 }),
        ...(maxCo2 !== undefined && { maxCo2 }),
        ...(plantedAfter && { plantedAfter }),
        ...(plantedBefore && { plantedBefore }),
        sortBy,
        sortOrder,
      },
      cachedAt: new Date().toISOString(),
    };

    return NextResponse.json(responsePayload, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=10',
        'X-Cached-At': responsePayload.cachedAt,
      },
    });
  } catch (err) {
    console.error('[api/trees/search] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
