/**
 * Global Forest Watch alert client — Issue #672
 *
 * Queries GFW's integrated deforestation alerts for a monitored zone polygon:
 *
 *   POST https://data-api.globalforestwatch.org
 *        /dataset/gfw_integrated_alerts/latest/query/json
 *   headers: x-api-key: <GFW_API_KEY>
 *   body:    { sql, geometry }  (GeoJSON Polygon, [lng, lat] ring)
 *
 * GFW returns point rows (`latitude`, `longitude`, date, confidence, area)
 * rather than GeoJSON features, so callers derive an affected-area polygon
 * from the detection point. The client rejects on any transport/API failure,
 * letting the service fall back to the mock feed.
 *
 * Requires `GFW_API_KEY` (create one at https://data-api.globalforestwatch.org
 * via /auth/apikey). When unset, `isGfwConfigured()` is false and the service
 * uses the mock provider instead.
 */

import { closeRing, pointInPolygon, type Point, type Ring } from '../geometry';
import type {
  AlertConfidence,
  DeforestationProvider,
  MonitoredZone,
  ProviderAlert,
} from '../types';

const DEFAULT_BASE_URL = 'https://data-api.globalforestwatch.org';
const DATASET = 'gfw_integrated_alerts';
const VERSION = 'latest';

/** Safety cap on rows pulled per zone per run. */
const MAX_ROWS = 500;

/** SQL date literal (YYYY-MM-DD) — safe because it is derived from a Date. */
function sqlDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toConfidence(value: unknown): AlertConfidence {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'high') return 'high';
  if (normalized === 'low') return 'low';
  return 'nominal';
}

function firstDefined(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

export function isGfwConfigured(): boolean {
  return Boolean(process.env.GFW_API_KEY);
}

export interface GfwClientOptions {
  /** Overrides `process.env.GFW_API_KEY`. */
  apiKey?: string;
  /** Overrides the data-api base URL (tests / proxies). */
  baseUrl?: string;
  /** Injectable fetch for tests. */
  fetchFn?: typeof fetch;
}

export function createGfwAlertClient(options: GfwClientOptions = {}): DeforestationProvider {
  const apiKey = options.apiKey ?? process.env.GFW_API_KEY ?? '';
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetchFn = options.fetchFn ?? fetch;

  return {
    name: 'gfw',
    async fetchAlerts(zone: MonitoredZone, since: Date): Promise<ProviderAlert[]> {
      if (!apiKey) {
        throw new Error('GFW API key is not configured (set GFW_API_KEY)');
      }

      const ring: Ring = closeRing(zone.polygon);
      const sinceDate = sqlDate(since);

      const sql = [
        'SELECT latitude, longitude, area__ha,',
        `       ${DATASET}__date, ${DATASET}__confidence`,
        'FROM results',
        `WHERE ${DATASET}__date >= '${sinceDate}'`,
        `LIMIT ${MAX_ROWS}`,
      ].join('\n');

      const response = await fetchFn(`${baseUrl}/dataset/${DATASET}/${VERSION}/query/json`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql,
          geometry: { type: 'Polygon', coordinates: [ring] },
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`GFW API ${response.status}: ${detail.slice(0, 300)}`);
      }

      const payload = (await response.json()) as {
        data?: Array<Record<string, unknown>>;
        status?: string;
      };
      if (payload.status && payload.status !== 'success') {
        throw new Error(`GFW API returned status "${payload.status}"`);
      }

      const rows = Array.isArray(payload.data) ? payload.data : [];
      const alerts: ProviderAlert[] = [];

      for (const row of rows) {
        const lat = Number(firstDefined(row, ['latitude', 'lat']));
        const lng = Number(firstDefined(row, ['longitude', 'lng', 'lon']));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const coordinates: Point = [lng, lat];
        // Defense in depth: keep only detections inside the monitored zone.
        if (!pointInPolygon(coordinates, ring)) continue;

        const detectedOn = String(
          firstDefined(row, [`${DATASET}__date`, 'date', 'alert_date']) ?? ''
        ).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(detectedOn)) continue;
        if (detectedOn < sinceDate) continue;

        const areaHectares = Number(firstDefined(row, ['area__ha', 'area_ha', 'area']) ?? 0);
        const confidence = toConfidence(
          firstDefined(row, [`${DATASET}__confidence`, 'confidence'])
        );

        alerts.push({
          id: `gfw-${zone.zoneId}-${detectedOn}-${lat.toFixed(4)}-${lng.toFixed(4)}`,
          detectedOn,
          confidence,
          areaHectares: Number.isFinite(areaHectares) && areaHectares > 0 ? areaHectares : 0,
          coordinates,
          sourceUrl: `https://www.globalforestwatch.org/map/?mapMode=monitor&pickGfwAlerts=${lat},${lng}`,
        });
      }

      return alerts;
    },
  };
}
