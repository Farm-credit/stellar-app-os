import { NextResponse } from 'next/server';
import {
  MAP_REGIONS_CACHE_KEY,
  getCachedMapData,
  setCachedMapData,
  type RegionMarker,
} from '@/lib/cache/map-cache';
import { getPool } from '@/lib/db/client';

/**
 * GET /api/map/regions
 *
 * Returns aggregated planting activity per privacy-preserving grid cell.
 * Each marker uses the cell's center coordinates — raw GPS is never exposed.
 *
 * Response shape:
 * {
 *   regions: Array<{
 *     regionKey: string;   // opaque HMAC identifier for the snapped grid cell
 *     lat: number;         // public cell center latitude
 *     lng: number;         // public cell center longitude
 *     treesPlanted: number;
 *     farmers: number;
 *   }>
 * }
 */
export const runtime = 'nodejs';

export async function GET() {
  try {
    const cachedRegions = await getCachedMapData<RegionMarker[]>(MAP_REGIONS_CACHE_KEY);
    if (cachedRegions) {
      return NextResponse.json(
        { regions: cachedRegions },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300' } }
      );
    }

    const pool = getPool();

    const { rows } = await pool.query<{
      region_key: string;
      center_lat: string;
      center_lon: string;
      trees_planted: string;
      farmers: string;
    }>(`
      SELECT
        region_key,
        center_lat,
        center_lon,
        COUNT(*)                       AS trees_planted,
        COUNT(DISTINCT farmer_id)      AS farmers
      FROM planting_regions
      GROUP BY region_key, center_lat, center_lon
      ORDER BY trees_planted DESC
    `);

    const regions = rows.map((r) => ({
      regionKey: r.region_key,
      lat: parseFloat(r.center_lat),
      lng: parseFloat(r.center_lon),
      treesPlanted: parseInt(r.trees_planted, 10),
      farmers: parseInt(r.farmers, 10),
    }));

    await setCachedMapData(MAP_REGIONS_CACHE_KEY, regions);

    return NextResponse.json(
      { regions },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300' } }
    );
  } catch (error) {
    // If the table doesn't exist yet return an empty list so the map still renders
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json({ regions: [] });
    }
    console.error('[map/regions] error:', error);
    return NextResponse.json({ error: 'Failed to load region data' }, { status: 500 });
  }
}
