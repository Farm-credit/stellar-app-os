export type DBClient = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
  end?: () => Promise<void>;
};

/**
 * calculateTotalCO2
 * - Estimates cumulative CO2 sequestered across active trees using species CO2/year rates.
 * - Caps per-tree years_at_planting at the species' maturity_years when available.
 * - Converts kilograms to metric tons (kg / 1000).
 *
 * Notes:
 * - Uses existing tables: trees, species_catalogue
 * - Adjust status filter or capping behavior to your business rules as required.
 */
export async function calculateTotalCO2(db: DBClient): Promise<number> {
  const sql = `
    WITH tree_age AS (
      SELECT
        t.id,
        t.species_slug,
        t.planted_at,
        -- years since planting, floor to integer years
        GREATEST(FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(t.planted_at, NOW()))) / 31557600)::INT, 0) AS years_since_planting,
        t.status,
        t.deleted_at
      FROM trees t
      WHERE t.deleted_at IS NULL
        AND t.status IN ('planted','verified','completed')
    )
    SELECT
      COALESCE(SUM(
        LEAST(COALESCE(tc.years_since_planting,0), COALESCE(s.maturity_years, tc.years_since_planting)) * COALESCE(s.co2_kg_per_year,0)
      ), 0) / 1000.0 AS total_metric_tons
    FROM tree_age tc
    LEFT JOIN species_catalogue s ON tc.species_slug = s.slug
  `;

  const res = await db.query(sql);
  const tons = Number(res.rows?.[0]?.total_metric_tons ?? 0);
  return Number(tons);
}
