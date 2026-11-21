/**
 * GET /api/planting-locations
 *
 * Returns browseable planting locations for the sponsor map with optional
 * filter query parameters. Falls back to mock data if the DB is unavailable
 * so the UI remains functional in local development without Postgres.
 *
 * Query params (all repeatable for multi-select semantics):
 *   ?region=Sub-Saharan+Africa&region=Latin+America
 *   &climate=Tropical&climate=Temperate
 *   &species=teak&species=moringa
 *
 * Response shape:
 *   {
 *     locations: PlantingLocation[],
 *     totalCount: number,
 *     options: { regionOptions, climateOptions, speciesOptions }
 *   }
 */

import { NextResponse } from 'next/server';
import {
  getMockPlantingLocations,
  filterPlantingLocations,
  getFilterOptions,
} from '@/lib/api/mock/plantingLocations';
import type { PlantingLocation } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface FilterBundle {
  regions: string[];
  climates: string[];
  species: string[];
}

function parseFilters(url: URL): FilterBundle {
  return {
    regions: url.searchParams.getAll('region'),
    climates: url.searchParams.getAll('climate'),
    species: url.searchParams.getAll('species'),
  };
}

async function fetchFromDb(): Promise<PlantingLocation[] | null> {
  try {
    const { getPool } = await import('@/lib/db/client');
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, name, description, latitude, longitude, region, climate,
              species, available_capacity AS "availableCapacity",
              created_at, updated_at
       FROM planting_locations
       WHERE available_capacity > 0
       ORDER BY available_capacity DESC`
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      region: row.region,
      climate: row.climate,
      species: Array.isArray(row.species) ? row.species : [],
      availableCapacity: Number(row.availableCapacity ?? 0),
    }));
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = parseFilters(new URL(request.url));
    void searchParams;

    const allLocations = (await fetchFromDb()) ?? getMockPlantingLocations();
    const filtered = filterPlantingLocations(allLocations, filters);
    const options = getFilterOptions(allLocations);

    return NextResponse.json({
      locations: filtered,
      totalCount: filtered.length,
      options,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch planting locations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
