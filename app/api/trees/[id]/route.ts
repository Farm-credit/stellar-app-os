/**
 * GET /api/trees/:id
 *
 * Returns a single tree record by its treeId (e.g. "HRV-2024-0001") or
 * internal id (e.g. "tree-001").  Data is served from the 30-second cache
 * shared with GET /api/trees.
 *
 * Responses:
 *   200  { tree: Tree, cachedAt: string }
 *   400  { error: "id is required" }
 *   404  { error: "tree not found" }
 *   500  { error: string }
 *
 * Closes #542
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getTreeById } from '@/lib/api/tree-registry';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id || id.trim() === '') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const tree = await getTreeById(id.trim());

    if (!tree) {
      return NextResponse.json({ error: 'tree not found' }, { status: 404 });
    }

    return NextResponse.json(
      { tree, cachedAt: new Date().toISOString() },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=10',
        },
      }
    );
  } catch (err) {
    console.error('[api/trees/:id] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
