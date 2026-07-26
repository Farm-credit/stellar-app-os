import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { fetchClimateNormals } from '@/lib/climate/climateClient';
import { calculateGrowthProjection } from '@/lib/growth/speciesGrowth';
import type { SpeciesGrowthParams } from '@/lib/growth/growthTypes';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

interface SpeciesRow {
  slug: string;
  common_name: string;
  biome: string;
  co2_kg_per_year: string; // NUMERIC returned as string by pg
  maturity_years: number;
}

interface TreeLookupRow {
  species_slug: string | null;
  lat: string | null;
  lng: string | null;
}

/**
 * GET /api/planting/growth-projection
 *
 * Computes a species' expected CO2/biomass growth curve from planting
 * through maturity (or a custom horizon), optionally adjusted for a
 * region's long-term rainfall/temperature suitability.
 *
 * Query params (one of speciesSlug or treeRef is required):
 *   speciesSlug  — species_catalogue slug, e.g. "teak"
 *   treeRef      — a planted tree's tree_ref; species + location are looked
 *                  up from it (speciesSlug/lat/lon are ignored if present)
 *   lat, lon     — optional region coordinates for climate adjustment
 *   years        — optional projection horizon (default: species maturity)
 *
 * Climate lookup is best-effort: if it's unavailable or fails, the curve is
 * still returned using a climate-neutral (1.0) factor.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const treeRef = searchParams.get('treeRef')?.trim();
  let speciesSlug = searchParams.get('speciesSlug')?.trim();
  let lat = searchParams.get('lat') ? Number(searchParams.get('lat')) : undefined;
  let lon = searchParams.get('lon') ? Number(searchParams.get('lon')) : undefined;
  const yearsParam = searchParams.get('years');
  const years = yearsParam ? Number(yearsParam) : undefined;

  try {
    const pool = getPool();

    if (treeRef) {
      const { rows } = await pool.query<TreeLookupRow>(
        `SELECT species_slug, lat, lng FROM trees WHERE tree_ref = $1`,
        [treeRef]
      );
      const tree = rows[0];
      if (!tree) {
        return NextResponse.json({ error: 'Tree not found' }, { status: 404 });
      }
      if (!tree.species_slug) {
        return NextResponse.json({ error: 'Tree has no assigned species' }, { status: 422 });
      }
      speciesSlug = tree.species_slug;
      lat = tree.lat ? Number(tree.lat) : lat;
      lon = tree.lng ? Number(tree.lng) : lon;
    }

    if (!speciesSlug) {
      return NextResponse.json({ error: 'speciesSlug or treeRef is required' }, { status: 400 });
    }

    if (years !== undefined && (!Number.isInteger(years) || years <= 0)) {
      return NextResponse.json({ error: 'years must be a positive integer' }, { status: 400 });
    }

    const { rows: speciesRows } = await pool.query<SpeciesRow>(
      `SELECT slug, common_name, biome, co2_kg_per_year, maturity_years
       FROM species_catalogue
       WHERE slug = $1`,
      [speciesSlug]
    );
    const speciesRow = speciesRows[0];
    if (!speciesRow) {
      return NextResponse.json({ error: 'Unknown species' }, { status: 404 });
    }

    const species: SpeciesGrowthParams = {
      slug: speciesRow.slug,
      commonName: speciesRow.common_name,
      biome: speciesRow.biome,
      co2KgPerYearAtMaturity: Number(speciesRow.co2_kg_per_year),
      maturityYears: speciesRow.maturity_years,
    };

    let climateNormals = null;
    if (
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lon)
    ) {
      const climateResult = await fetchClimateNormals(lat, lon);
      if (climateResult.status === 'ok') {
        climateNormals = climateResult.normals;
      } else {
        logger.warn('[growth-projection] climate lookup failed, using neutral factor', {
          speciesSlug,
          lat,
          lon,
          error: climateResult.error,
        });
      }
    }

    const projection = calculateGrowthProjection(species, climateNormals, years);

    return NextResponse.json(projection, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=3600' },
    });
  } catch (error) {
    logger.error('[growth-projection] GET error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
