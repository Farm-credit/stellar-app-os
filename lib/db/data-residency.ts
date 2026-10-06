import { Pool, type QueryResultRow } from 'pg';

/**
 * Data residency (#1141).
 *
 * Sponsor data must be stored in the geographic region that governs it:
 *   - EU sponsors  → EU database
 *   - APAC sponsors → APAC database
 *   - Americas sponsors → US database
 *
 * Regional connection strings are configured with:
 *   DATA_RESIDENCY_EU_DATABASE_URL
 *   DATA_RESIDENCY_APAC_DATABASE_URL
 *   DATA_RESIDENCY_AMERICAS_DATABASE_URL
 *
 * When a regional URL is unset the default `DATABASE_URL` is used, so local
 * development and existing single-region deployments keep working unchanged.
 */

export const DATA_REGIONS = ['eu', 'apac', 'americas'] as const;
export type DataRegion = (typeof DATA_REGIONS)[number];

const REGION_ENV: Record<DataRegion, string> = {
  eu: 'DATA_RESIDENCY_EU_DATABASE_URL',
  apac: 'DATA_RESIDENCY_APAC_DATABASE_URL',
  americas: 'DATA_RESIDENCY_AMERICAS_DATABASE_URL',
};

/** ISO 3166-1 alpha-2 country → data residency region. */
const COUNTRY_REGIONS: Record<string, DataRegion> = {
  // EU / EEA member states
  AT: 'eu', BE: 'eu', BG: 'eu', HR: 'eu', CY: 'eu', CZ: 'eu', DK: 'eu',
  EE: 'eu', FI: 'eu', FR: 'eu', DE: 'eu', GR: 'eu', HU: 'eu', IE: 'eu',
  IT: 'eu', LV: 'eu', LT: 'eu', LU: 'eu', MT: 'eu', NL: 'eu', PL: 'eu',
  PT: 'eu', RO: 'eu', SK: 'eu', SI: 'eu', ES: 'eu', SE: 'eu',
  // EEA / Switzerland / UK
  IS: 'eu', LI: 'eu', NO: 'eu', CH: 'eu', GB: 'eu',
  // APAC
  AU: 'apac', NZ: 'apac', JP: 'apac', KR: 'apac', CN: 'apac', HK: 'apac',
  TW: 'apac', SG: 'apac', MY: 'apac', TH: 'apac', VN: 'apac', PH: 'apac',
  ID: 'apac', IN: 'apac', PK: 'apac', BD: 'apac', LK: 'apac', NP: 'apac',
  // Americas
  US: 'americas', CA: 'americas', MX: 'americas', BR: 'americas', AR: 'americas',
  CL: 'americas', CO: 'americas', PE: 'americas', UY: 'americas', EC: 'americas',
  GT: 'americas', CR: 'americas', PA: 'americas', DO: 'americas', CU: 'americas',
};

const REGION_ALIASES: Record<string, DataRegion> = {
  eu: 'eu', eea: 'eu', europe: 'eu', 'european union': 'eu',
  'united kingdom': 'eu', uk: 'eu', switzerland: 'eu', swiss: 'eu',
  apac: 'apac', 'asia pacific': 'apac', 'asia-pacific': 'apac', asia: 'apac',
  'southeast asia': 'apac', 'east asia': 'apac', oceania: 'apac',
  americas: 'americas', america: 'americas', 'north america': 'americas',
  'south america': 'americas', 'latin america': 'americas', 'central america': 'americas',
  us: 'americas', usa: 'americas', 'united states': 'americas', canada: 'americas',
  mexico: 'americas', brazil: 'americas',
};

const pools = new Map<DataRegion, Pool>();

function defaultRegion(): DataRegion {
  const configured = process.env.DATA_RESIDENCY_DEFAULT_REGION?.trim().toLowerCase();
  if (configured && (DATA_REGIONS as readonly string[]).includes(configured)) {
    return configured as DataRegion;
  }
  return 'americas';
}

/**
 * Map a free-form region/country value to a data residency region.
 *
 * Accepts region names ("Europe", "APAC", "United States"), ISO alpha-2
 * country codes ("DE", "JP", "US"), and falls back to the configured default.
 */
export function resolveDataRegion(input?: string | null): DataRegion {
  if (!input) return defaultRegion();

  const key = input.trim().toLowerCase();
  if (key in REGION_ALIASES) return REGION_ALIASES[key];
  if (key.length === 2 && key.toUpperCase() in COUNTRY_REGIONS) {
    return COUNTRY_REGIONS[key.toUpperCase()];
  }

  return defaultRegion();
}

/**
 * Return (and lazily create) the connection pool for a data residency region.
 * Falls back to `DATABASE_URL` when the regional URL is not configured.
 */
export function getRegionalPool(region: DataRegion): Pool {
  const existing = pools.get(region);
  if (existing) return existing;

  const envUrl = process.env[REGION_ENV[region]];
  const connectionString = envUrl || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      `No database URL configured for data region "${region}". ` +
        `Set ${REGION_ENV[region]} (or DATABASE_URL for single-region deployments).`
    );
  }

  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err) => {
    console.error(`[db][data-region:${region}] unexpected pool error`, err);
  });

  pools.set(region, pool);
  return pool;
}

/**
 * Run a query across the regional pools, returning the first region that has
 * rows. Used by read paths that do not yet know where a record lives (e.g.
 * looking up a waitlist entry by id). Order: americas → eu → apac, so
 * single-region deployments resolve on the first attempt.
 */
export async function queryAcrossRegions<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[]; region: DataRegion | null }> {
  for (const region of DATA_REGIONS) {
    const pool = getRegionalPool(region);
    const { rows } = await pool.query<T>(sql, params);
    if (rows.length > 0) {
      return { rows, region };
    }
  }
  return { rows: [], region: null };
}

/** Test helper: drop cached regional pools so tests can re-seed them. */
export function resetRegionalPools(): void {
  pools.clear();
}
