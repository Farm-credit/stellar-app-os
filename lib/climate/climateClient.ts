import logger from '@/lib/logger';
import type { ClimateFetchResult } from './climateTypes';

const DEFAULT_BASE_URL = 'https://power.larc.nasa.gov/api/temporal/climatology/point';
const DEFAULT_TIMEOUT_MS = 8_000;

const MONTH_KEYS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

// Non-leap-year day counts — fine for long-term climatological normals.
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

interface NasaPowerClimatologyResponse {
  properties?: {
    parameter?: {
      T2M?: Partial<Record<(typeof MONTH_KEYS)[number] | 'ANN', number>>;
      PRECTOTCORR?: Partial<Record<(typeof MONTH_KEYS)[number] | 'ANN', number>>;
    };
  };
}

function getConfig() {
  return {
    baseUrl: process.env.CLIMATE_API_BASE_URL || DEFAULT_BASE_URL,
    apiKey: process.env.CLIMATE_API_KEY,
    timeoutMs: (() => {
      const parsed = Number(process.env.CLIMATE_API_TIMEOUT_MS);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
    })(),
  };
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'AbortError' ? 'Climate API request timed out' : error.message;
  }
  return 'Unknown error';
}

/**
 * Fetches long-term average annual/monthly rainfall and temperature normals
 * for a lat/lon from the configured climate API (default: NASA POWER, a
 * free, keyless public climatology endpoint).
 *
 * Never throws — network/parse/timeout failures are returned as
 * `{ status: 'error', error }` so callers can fall back to an
 * unadjusted (climate-neutral) growth projection.
 */
export async function fetchClimateNormals(lat: number, lon: number): Promise<ClimateFetchResult> {
  const { baseUrl, apiKey, timeoutMs } = getConfig();

  const url = new URL(baseUrl);
  url.searchParams.set('parameters', 'T2M,PRECTOTCORR');
  url.searchParams.set('community', 'AG');
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('format', 'JSON');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });

    if (!response.ok) {
      return { status: 'error', error: `Climate API returned HTTP ${response.status}` };
    }

    const data = (await response.json()) as NasaPowerClimatologyResponse;
    const t2m = data.properties?.parameter?.T2M ?? {};
    const precip = data.properties?.parameter?.PRECTOTCORR ?? {};

    const annualTemperatureC = t2m.ANN;
    const annualPrecipMmPerDay = precip.ANN;
    if (typeof annualTemperatureC !== 'number' || typeof annualPrecipMmPerDay !== 'number') {
      return { status: 'error', error: 'Climate API response missing expected fields' };
    }

    const monthlyTemperatureC = MONTH_KEYS.map((key) => t2m[key] ?? annualTemperatureC);
    const monthlyRainfallMm = MONTH_KEYS.map(
      (key, i) => (precip[key] ?? annualPrecipMmPerDay) * DAYS_IN_MONTH[i]
    );

    return {
      status: 'ok',
      normals: {
        avgAnnualTemperatureC: annualTemperatureC,
        avgAnnualRainfallMm: monthlyRainfallMm.reduce((sum, mm) => sum + mm, 0),
        monthlyTemperatureC,
        monthlyRainfallMm,
        source: 'NASA POWER',
      },
    };
  } catch (error) {
    const message = safeErrorMessage(error);
    logger.warn('[climate-client] fetchClimateNormals failed', { lat, lon, error: message });
    return { status: 'error', error: message };
  } finally {
    clearTimeout(timer);
  }
}
