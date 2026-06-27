/**
 * GET /api/trees
 *
 * Returns a paginated, filtered list of all registered trees by querying
 * Stellar Horizon and the on-chain contract state. Results are cached for 30 s.
 *
 * Query parameters:
 *   species   — filter by species  (Teak | Moringa | Eucalyptus | Mangrove | all)
 *   region    — filter by region string or "all"
 *   status    — filter by status   (funded | planted | verified | completed | failed | all)
 *   search    — free-text search across treeId, species, region, projectName
 *   limit     — max results (default 50, max 200)
 *   offset    — pagination offset  (default 0)
 *
 * Closes #542
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getTreeList } from '@/lib/api/tree-registry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;

    const opts = {
      species: p.get('species') ?? undefined,
      region: p.get('region') ?? undefined,
      status: p.get('status') ?? undefined,
      search: p.get('search') ?? undefined,
      limit: p.has('limit') ? parseInt(p.get('limit')!, 10) : 50,
      offset: p.has('offset') ? parseInt(p.get('offset')!, 10) : 0,
    };

    const result = await getTreeList(opts);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=10',
        'X-Cached-At': result.cachedAt,
      },
    });
  } catch (err) {
    console.error('[api/trees] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
