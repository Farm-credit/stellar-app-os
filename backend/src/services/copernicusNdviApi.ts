// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Copernicus / Sentinel-2 NDVI vegetation-density API client.
 *
 * Issue #1429 / Land Plot Audits: connect the Sentinel-Copernicus NDVI
 * vegetation density API so the backend verification service can cross-check
 * ground planting claims against satellite-observed vegetation.
 *
 * This client talks to the Copernicus Data Space Ecosystem (CDSE):
 *
 *   1. OAuth2 client-credentials token
 *        POST https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
 *
 *   2. Statistical API — mean NDVI / EVI over a plot geometry
 *        POST https://sh.dataspace.copernicus.eu/api/v1/statistics
 *
 * The Statistical API runs an evalscript over Sentinel-2 L2A imagery for a
 * polygon (or bounding box) and time range, returning band statistics
 * (mean / stdev / min / max / sampleCount) for each output. NDVI is computed
 * as (B08 - B04) / (B08 + B04) and EVI as
 *   2.5 * (NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1).
 *
 * Design notes:
 *   - `fetch` is dependency-injected via `CopernicusConfig.fetchImpl` so unit
 *     tests never hit the network and the client is usable in any runtime.
 *   - When credentials are absent the client reports `isCopernicusConfigured()
 *     === false`; callers (the verification service) fall back to simulation
 *     so local dev and CI keep working without keys.
 *   - Errors are thrown as `CopernicusApiError` (an Error subclass) with the
 *     HTTP status attached when available.
 */

// ── Defaults (Copernicus Data Space Ecosystem endpoints) ──────────────────────

const DEFAULT_TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const DEFAULT_STATISTICAL_API_URL = 'https://sh.dataspace.copernicus.eu/api/v1/statistics';
const DEFAULT_COLLECTION_ID = 'sentinel-2-l2a';
const DEFAULT_MAX_CLOUD_COVERAGE = 30;
const DEFAULT_RESOLUTION_METERS = 10;

/** GeoJSON CRS identifier for EPSG:4326 (lon/lat), as the Statistical API expects. */
const CRS_4326 = 'http://www.opengis.net/def/crs/EPSG/0/4326';

/** Seconds of safety margin subtracted from token expiry to avoid edge races. */
const TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS = 60;

/** Sentinel-2 L2A evalscript computing NDVI and EVI as two FLOAT32 outputs. */
const NDVI_EVI_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "B02"], units: "reflectance" }],
    mosaicking: "simple",
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "evi", bands: 1, sampleType: "FLOAT32" }
    ]
  };
}
function evaluatePixel(sample) {
  var ndvi = index(sample.B08, sample.B04);
  var evi = 2.5 * (sample.B08 - sample.B04) /
            (sample.B08 + 6.0 * sample.B04 - 7.5 * sample.B02 + 1.0);
  return { ndvi: [ndvi], evi: [evi] };
}
`;

// ── Types ────────────────────────────────────────────────────────────────────

/** Bounds in decimal degrees (north/south latitude, east/west longitude). */
export interface SatelliteImageBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Configuration for the Copernicus NDVI client, sourced from env by default. */
export interface CopernicusConfig {
  clientId?: string;
  clientSecret?: string;
  tokenUrl: string;
  statisticalApiUrl: string;
  collectionId: string;
  maxCloudCoverage: number;
  resolutionMeters: number;
  /**
   * Custom fetch implementation. Defaults to globalThis.fetch. Injected by
   * tests so no real network call is made.
   */
  fetchImpl?: typeof fetch;
}

/** A GeoJSON Polygon geometry used to scope a statistics query. */
export interface NdviQueryGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

/** Inclusive date range for a statistics query (ISO-8601). */
export interface NdviDateRange {
  from: string;
  to: string;
}

/** NDVI / EVI statistics for a plot over a date range. */
export interface NdviStatistics {
  /** Mean NDVI over the plot geometry, clamped to [-1, 1]. */
  meanNdvi: number;
  /** NDVI standard deviation across pixels, or null when unavailable. */
  stdevNdvi: number | null;
  /** Minimum NDVI across pixels, or null when unavailable. */
  minNdvi: number | null;
  /** Maximum NDVI across pixels, or null when unavailable. */
  maxNdvi: number | null;
  /** Mean EVI over the plot geometry, or null when EVI could not be computed. */
  meanEvi: number | null;
  /** Number of valid observations (pixels) aggregated into the stats. */
  sampleCount: number;
  /** Acquisition interval returned by the API, or null when no data. */
  interval: { from: string; to: string } | null;
  /** Data source label for downstream audit records. */
  source: string;
  /** Collection / dataset id used for the query. */
  collectionId: string;
}

/** Typed error thrown by the Copernicus client. */
export class CopernicusApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CopernicusApiError';
    if (status !== undefined) this.status = status;
  }
}

// ── Module-level token cache ─────────────────────────────────────────────────

interface CachedToken {
  value: string;
  expiresAt: number; // epoch ms
}

let cachedToken: CachedToken | null = null;

/** Clear the in-memory access-token cache. Intended for test isolation. */
export function clearCopernicusTokenCache(): void {
  cachedToken = null;
}

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * Build the Copernicus client config from environment variables, with optional
 * overrides. Environment variables:
 *   COPERNICUS_CLIENT_ID, COPERNICUS_CLIENT_SECRET (required for live calls)
 *   COPERNICUS_TOKEN_URL          (optional override)
 *   COPERNICUS_STATISTICAL_API_URL (optional override)
 *   COPERNICUS_COLLECTION_ID      (optional, default sentinel-2-l2a)
 *   COPERNICUS_MAX_CLOUD_COVERAGE (optional, default 30)
 *   COPERNICUS_RESOLUTION_METERS  (optional, default 10)
 */
export function getCopernicusConfig(
  overrides: Partial<CopernicusConfig> = {}
): CopernicusConfig {
  return {
    clientId: overrides.clientId ?? process.env.COPERNICUS_CLIENT_ID,
    clientSecret: overrides.clientSecret ?? process.env.COPERNICUS_CLIENT_SECRET,
    tokenUrl: overrides.tokenUrl ?? process.env.COPERNICUS_TOKEN_URL ?? DEFAULT_TOKEN_URL,
    statisticalApiUrl:
      overrides.statisticalApiUrl ??
      process.env.COPERNICUS_STATISTICAL_API_URL ??
      DEFAULT_STATISTICAL_API_URL,
    collectionId:
      overrides.collectionId ?? process.env.COPERNICUS_COLLECTION_ID ?? DEFAULT_COLLECTION_ID,
    maxCloudCoverage:
      overrides.maxCloudCoverage ??
      parseOptionalNumber(process.env.COPERNICUS_MAX_CLOUD_COVERAGE, DEFAULT_MAX_CLOUD_COVERAGE),
    resolutionMeters:
      overrides.resolutionMeters ??
      parseOptionalNumber(process.env.COPERNICUS_RESOLUTION_METERS, DEFAULT_RESOLUTION_METERS),
    fetchImpl: overrides.fetchImpl,
  };
}

/** True when client credentials are present and the client can make live calls. */
export function isCopernicusConfigured(config: CopernicusConfig = getCopernicusConfig()): boolean {
  return Boolean(config.clientId && config.clientSecret);
}

function parseOptionalNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

/**
 * Convert a lat/lon bounding box to a counter-clockwise GeoJSON Polygon.
 * Coordinates are [longitude, latitude] per the GeoJSON spec.
 */
export function boundsToGeoJsonPolygon(bounds: SatelliteImageBounds): NdviQueryGeometry {
  const { north, south, east, west } = bounds;
  if (north <= south) {
    throw new CopernicusApiError(
      `Invalid bounds: north (${north}) must be greater than south (${south}).`
    );
  }
  if (east <= west) {
    throw new CopernicusApiError(
      `Invalid bounds: east (${east}) must be greater than west (${west}).`
    );
  }
  // Counter-clockwise exterior ring ensures a valid GeoJSON polygon.
  const ring: number[][] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
  return { type: 'Polygon', coordinates: [ring] };
}

/**
 * Build a square GeoJSON Polygon buffer around a point (approximate, suitable
 * for small plots). Used when only a centroid coordinate is available.
 *
 * @param latitude   Plot centroid latitude in decimal degrees.
 * @param longitude  Plot centroid longitude in decimal degrees.
 * @param radiusMeters Half-side length of the buffer square in metres.
 */
export function pointBufferToGeoJsonPolygon(
  latitude: number,
  longitude: number,
  radiusMeters = 50
): NdviQueryGeometry {
  const R = 6371000; // Earth radius (m)
  const latRad = (latitude * Math.PI) / 180;
  const dLat = radiusMeters / R;
  const dLon = radiusMeters / (R * Math.cos(latRad));
  const south = latitude - (dLat * 180) / Math.PI;
  const north = latitude + (dLat * 180) / Math.PI;
  const west = longitude - (dLon * 180) / Math.PI;
  const east = longitude + (dLon * 180) / Math.PI;
  return boundsToGeoJsonPolygon({ north, south, east, west });
}

// ── Token acquisition ─────────────────────────────────────────────────────────

/**
 * Acquire an OAuth2 access token from the Copernicus token endpoint using the
 * client-credentials grant. Tokens are cached until shortly before expiry.
 *
 * @throws CopernicusApiError when not configured, fetch is unavailable, or the
 *   token endpoint returns a non-2xx response.
 */
export async function fetchCopernicusAccessToken(
  config: CopernicusConfig = getCopernicusConfig()
): Promise<string> {
  if (!isCopernicusConfigured(config)) {
    throw new CopernicusApiError(
      'Copernicus credentials are not configured. Set COPERNICUS_CLIENT_ID and ' +
        'COPERNICUS_CLIENT_SECRET to enable Sentinel-2 NDVI lookups.'
    );
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const fetchFn = resolveFetch(config);

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId as string,
    client_secret: config.clientSecret as string,
  });

  let res: Response;
  try {
    res = await fetchFn(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (err) {
    throw new CopernicusApiError(
      `Failed to reach Copernicus token endpoint: ${err instanceof Error ? err.message : 'network error'}.`
    );
  }

  if (!res.ok) {
    throw new CopernicusApiError(
      `Copernicus token request failed with HTTP ${res.status}.`,
      res.status
    );
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new CopernicusApiError('Copernicus token response did not include access_token.');
  }

  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + Math.max(0, expiresIn - TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS) * 1000,
  };
  return json.access_token;
}

// ── NDVI statistics query ────────────────────────────────────────────────────

/**
 * Query the Copernicus Statistical API for mean NDVI (and EVI) over a plot
 * geometry for the given date range.
 *
 * @param geometry  Plot geometry (GeoJSON Polygon).
 * @param dateRange Inclusive [from, to] ISO-8601 window for the query.
 * @param config    Client config (defaults to env-derived config).
 * @returns         NDVI / EVI statistics. When no cloud-free pixels exist for
 *                  the window, `sampleCount` is 0 and index means are 0.
 * @throws CopernicusApiError on auth failure or non-2xx responses.
 */
export async function fetchNdviStatistics(
  geometry: NdviQueryGeometry,
  dateRange: NdviDateRange,
  config: CopernicusConfig = getCopernicusConfig()
): Promise<NdviStatistics> {
  if (!isCopernicusConfigured(config)) {
    throw new CopernicusApiError(
      'Copernicus credentials are not configured. Set COPERNICUS_CLIENT_ID and ' +
        'COPERNICUS_CLIENT_SECRET to enable Sentinel-2 NDVI lookups.'
    );
  }

  const accessToken = await fetchCopernicusAccessToken(config);
  const fetchFn = resolveFetch(config);

  const requestBody = buildStatisticsRequestBody(geometry, dateRange, config);

  let res: Response;
  try {
    res = await fetchFn(config.statisticalApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    throw new CopernicusApiError(
      `Failed to reach Copernicus Statistical API: ${err instanceof Error ? err.message : 'network error'}.`
    );
  }

  if (!res.ok) {
    const detail = await readErrorDetail(res);
    throw new CopernicusApiError(
      `Copernicus Statistical API returned HTTP ${res.status}${detail ? `: ${detail}` : ''}.`,
      res.status
    );
  }

  const json = (await res.json()) as unknown;
  return parseStatisticsResponse(json, config.collectionId);
}

// ── Request / response handling ─────────────────────────────────────────────

function buildStatisticsRequestBody(
  geometry: NdviQueryGeometry,
  dateRange: NdviDateRange,
  config: CopernicusConfig
): Record<string, unknown> {
  const fromIso = ensureIso(dateRange.from);
  const toIso = ensureIso(dateRange.to);
  return {
    input: {
      bounds: {
        geometry,
        properties: { crs: CRS_4326 },
      },
      data: [
        {
          type: config.collectionId,
          dataFilter: {
            timeRange: { from: fromIso, to: toIso },
            maxCloudCoverage: config.maxCloudCoverage,
          },
        },
      ],
    },
    aggregation: {
      timeRange: { from: fromIso, to: toIso },
      aggregationUnits: 'none',
      evalscript: NDVI_EVI_EVALSCRIPT,
      resolution: { unit: 'm', value: config.resolutionMeters },
    },
    calculations: { default: {} },
  };
}

function parseStatisticsResponse(
  json: unknown,
  collectionId: string
): NdviStatistics {
  const empty: NdviStatistics = {
    meanNdvi: 0,
    stdevNdvi: null,
    minNdvi: null,
    maxNdvi: null,
    meanEvi: null,
    sampleCount: 0,
    interval: null,
    source: 'copernicus-sentinel-2',
    collectionId,
  };

  if (typeof json !== 'object' || json === null) return empty;

  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return empty;

  const first = data[0] as {
    interval?: { from?: string; to?: string };
    outputs?: Record<string, { bands?: Record<string, { stats?: RawStats }> }>;
  };
  const outputs = first.outputs;
  if (!outputs) return empty;

  const ndviStats = extractFirstBandStats(outputs.ndvi);
  const eviStats = extractFirstBandStats(outputs.evi);

  const interval =
    first.interval && typeof first.interval.from === 'string' && typeof first.interval.to === 'string'
      ? { from: first.interval.from, to: first.interval.to }
      : null;

  return {
    meanNdvi: clampNdvi(ndviStats?.mean ?? 0),
    stdevNdvi: numberOrNull(ndviStats?.stdev),
    minNdvi: numberOrNull(ndviStats?.min),
    maxNdvi: numberOrNull(ndviStats?.max),
    meanEvi: eviStats ? clampIndex(eviStats.mean) : null,
    sampleCount: ndviStats?.sampleCount ?? 0,
    interval,
    source: 'copernicus-sentinel-2',
    collectionId,
  };
}

interface RawStats {
  mean?: number;
  stdev?: number;
  min?: number;
  max?: number;
  sampleCount?: number;
}

function extractFirstBandStats(output: { bands?: Record<string, { stats?: RawStats }> } | undefined):
  | RawStats
  | undefined {
  if (!output || !output.bands) return undefined;
  const firstBand = Object.values(output.bands)[0];
  return firstBand?.stats;
}

// ── Utility ──────────────────────────────────────────────────────────────────

function resolveFetch(config: CopernicusConfig): typeof fetch {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new CopernicusApiError(
      'No fetch implementation is available. Provide `fetchImpl` in the Copernicus config ' +
        'or run in an environment with a global fetch.'
    );
  }
  return fetchImpl;
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.length > 0 ? text.slice(0, 500) : '';
  } catch {
    return '';
  }
}

/** Ensure a date string is a full ISO-8601 timestamp (appends T00:00:00Z for dates). */
function ensureIso(date: string): string {
  if (date.includes('T')) return date;
  return `${date}T00:00:00Z`;
}

function clampIndex(value: number | undefined | null): number | null {
  if (value === undefined || value === null || !Number.isFinite(value)) return null;
  return Math.max(-1, Math.min(1, value));
}

function clampNdvi(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function numberOrNull(value: number | undefined | null): number | null {
  if (value === undefined || value === null || !Number.isFinite(value)) return null;
  return value;
}
