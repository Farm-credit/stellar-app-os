import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { decodeGeohash } from '@/lib/geo/geohash';

interface MapPointRow {
  geohash: string;
  region: string;
  tree_count: number;
}

/**
 * GET /api/planting/map
 *
 * Returns geohash clusters for the live tree-planting map.
 * Each point carries a cell centre (lat/lon) derived from the geohash —
 * never the exact planting GPS.
 *
 * Optional query param: ?region=<string> to filter by region.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const region = searchParams.get('region');

  try {
    const pool = getPool();
    const { rows } = await pool.query<MapPointRow>(
      `SELECT geohash, region, tree_count
       FROM tree_map_points
       ${region ? 'WHERE region = $1' : ''}
       ORDER BY tree_count DESC`,
      region ? [region] : []
    );

    const points = rows.map(({ geohash, region: r, tree_count }) => ({
      geohash,
      region: r,
      treeCount: tree_count,
      ...decodeGeohash(geohash), // adds lat/lon cell centre
    }));

    return NextResponse.json({ points });
  } catch (error) {
    console.error('[planting/map] GET error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
