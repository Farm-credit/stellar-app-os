import { getPool } from '@/lib/db/client';

export interface QueryFilter {
  region?: string;
  species?: string;
}

export interface RegionMetricsResult {
  region: string;
  countryCode: string | null;
  totalTrees: number;
  totalCo2SequestrationKg: number;
  activePlantersCount: number;
}

export interface SpeciesMetricsResult {
  speciesSlug: string;
  speciesName: string | null;
  totalTrees: number;
  totalCo2SequestrationKg: number;
  co2KgPerTreeYear: number;
}

export interface AggregateSequestrationResult {
  totalTrees: number;
  totalCo2SequestrationKg: number;
  totalPlanters: number;
  activeRegionsCount: number;
  speciesCount: number;
  byRegion: RegionMetricsResult[];
  bySpecies: SpeciesMetricsResult[];
}

export async function resolveTreeRegistryAnalytics(
  filters: QueryFilter = {}
): Promise<AggregateSequestrationResult> {
  const pool = getPool();

  const whereClauses: string[] = ["t.deleted_at IS NULL"];
  const params: unknown[] = [];

  if (filters.region) {
    params.push(filters.region);
    whereClauses.push(`t.region = $${params.length}`);
  }

  if (filters.species) {
    params.push(filters.species);
    whereClauses.push(`t.species_slug = $${params.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // 1. Overall Aggregates Query
  const summaryQuery = `
    SELECT 
      COUNT(t.id)::int as total_trees,
      COALESCE(SUM(sc.co2_kg_per_year), 0)::float as total_co2_kg,
      COUNT(DISTINCT t.planter_id)::int as total_planters,
      COUNT(DISTINCT t.region)::int as active_regions_count,
      COUNT(DISTINCT t.species_slug)::int as species_count
    FROM trees t
    LEFT JOIN species_catalogue sc ON t.species_slug = sc.species_slug
    ${whereSql};
  `;

  // 2. Region Breakdown Query
  const regionQuery = `
    SELECT 
      t.region,
      MAX(t.country_code) as country_code,
      COUNT(t.id)::int as total_trees,
      COALESCE(SUM(sc.co2_kg_per_year), 0)::float as total_co2_kg,
      COUNT(DISTINCT t.planter_id)::int as active_planters
    FROM trees t
    LEFT JOIN species_catalogue sc ON t.species_slug = sc.species_slug
    ${whereSql}
    GROUP BY t.region
    ORDER BY total_co2_kg DESC;
  `;

  // 3. Species Breakdown Query
  const speciesQuery = `
    SELECT 
      t.species_slug,
      MAX(sc.name) as species_name,
      COUNT(t.id)::int as total_trees,
      COALESCE(SUM(sc.co2_kg_per_year), 0)::float as total_co2_kg,
      COALESCE(MAX(sc.co2_kg_per_year), 25.0)::float as co2_per_tree_year
    FROM trees t
    LEFT JOIN species_catalogue sc ON t.species_slug = sc.species_slug
    ${whereSql}
    GROUP BY t.species_slug
    ORDER BY total_co2_kg DESC;
  `;

  try {
    const [summaryRes, regionRes, speciesRes] = await Promise.all([
      pool.query(summaryQuery, params),
      pool.query(regionQuery, params),
      pool.query(speciesQuery, params),
    ]);

    const summaryRow = summaryRes.rows[0] || {
      total_trees: 0,
      total_co2_kg: 0,
      total_planters: 0,
      active_regions_count: 0,
      species_count: 0,
    };

    const byRegion: RegionMetricsResult[] = regionRes.rows.map((r) => ({
      region: r.region || 'Unknown',
      countryCode: r.country_code || null,
      totalTrees: r.total_trees || 0,
      totalCo2SequestrationKg: r.total_co2_kg || 0,
      activePlantersCount: r.active_planters || 0,
    }));

    const bySpecies: SpeciesMetricsResult[] = speciesRes.rows.map((r) => ({
      speciesSlug: r.species_slug || 'unspecified',
      speciesName: r.species_name || null,
      totalTrees: r.total_trees || 0,
      totalCo2SequestrationKg: r.total_co2_kg || 0,
      co2KgPerTreeYear: r.co2_per_tree_year || 0,
    }));

    return {
      totalTrees: summaryRow.total_trees || 0,
      totalCo2SequestrationKg: summaryRow.total_co2_kg || 0,
      totalPlanters: summaryRow.total_planters || 0,
      activeRegionsCount: summaryRow.active_regions_count || 0,
      speciesCount: summaryRow.species_count || 0,
      byRegion,
      bySpecies,
    };
  } catch (err) {
    console.error('[GraphQL Resolvers] Error querying tree registry analytics:', err);
    throw err;
  }
}
