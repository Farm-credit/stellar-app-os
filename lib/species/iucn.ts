/**
 * IUCN Red List API v4 client — Issue #1657.
 *
 * Thin, dependency-free wrapper around `https://api.iucnredlist.org/v4`.
 * All response parsing lives in pure exported functions so the network layer
 * can be tested without touching the API.
 *
 * Authentication: an `Authorization: Bearer <IUCN_RED_LIST_API_TOKEN>` header.
 * When the token is absent the checker skips the quarter rather than guessing
 * conservation status — we never invent an IUCN category.
 */

import type { IucnCategoryCode, PopulationTrend } from './conservation';

export const IUCN_API_BASE_URL = 'https://api.iucnredlist.org/v4';

/** Maximum number of scientific names accepted by a single v4 request. */
export const IUCN_MAX_NAMES_PER_REQUEST = 100;

/** Read-only fetcher so tests can inject a stub without globals. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface IucnAssessment {
  /** IUCN taxon identifier, when the API returned one. */
  taxonId: number | null;
  /** Scientific name as returned by the API. */
  scientificName: string;
  /** Raw IUCN category code (EX, EW, CR, EN, VU, NT, LC, DD, NE). */
  statusCode: IucnCategoryCode | null;
  populationTrend: PopulationTrend | null;
  /** ISO 8601 assessment date. */
  assessedAt: string | null;
  /** Whether the API reported the taxon as found (v4 `result` field). */
  found: boolean;
}

export class IucnApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number
  ) {
    super(message);
    this.name = 'IucnApiError';
  }
}

export function iucnTokenConfigured(token?: string | null): boolean {
  return Boolean(token ?? process.env.IUCN_RED_LIST_API_TOKEN);
}

// ── Pure response parsing ────────────────────────────────────────────────────

const CATEGORY_CODES = new Set<string>(['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE']);

const TREND_BY_KEY: Record<string, PopulationTrend> = {
  increasing: 'Increasing',
  stable: 'Stable',
  decreasing: 'Decreasing',
  unknown: 'Unknown',
  // The v4 API may return "Stable" / "Decreasing" verbatim.
  Increasing: 'Increasing',
  Stable: 'Stable',
  Decreasing: 'Decreasing',
  Unknown: 'Unknown',
};

/** Normalises whatever the API sent into a known category code, or null. */
export function normalizeCategory(value: unknown): IucnCategoryCode | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return CATEGORY_CODES.has(code) ? (code as IucnCategoryCode) : null;
}

/** Normalises the population trend, defaulting to Unknown. */
export function normalizeTrend(value: unknown): PopulationTrend | null {
  if (typeof value !== 'string') return null;
  return TREND_BY_KEY[value.trim()] ?? null;
}

/** Parses an ISO-ish assessment date, or null when unusable. */
export function normalizeAssessedAt(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Parses a single taxon object from the v4 `/taxa` response.
 *
 * The v4 API nests the assessment fields at the top level of each result:
 * `{ result: true, taxonid, scientific_name, category, population_trend,
 *    assessment_date }`. Different gateway deployments have shipped slightly
 * different spellings, so every field is read defensively.
 */
export function parseTaxon(raw: unknown): IucnAssessment {
  const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const scientificName = String(
    record.scientific_name ?? record.scientificName ?? record.name ?? ''
  ).trim();

  const taxonIdRaw = record.taxonid ?? record.taxon_id ?? record.taxonId;
  const taxonId =
    taxonIdRaw === null || taxonIdRaw === undefined || taxonIdRaw === ''
      ? null
      : Number(taxonIdRaw);
  const safeTaxonId = taxonId !== null && Number.isFinite(taxonId) ? taxonId : null;

  const category = normalizeCategory(record.category ?? record.iucn_category);
  const foundRaw = record.result ?? record.found;
  // `result: false` means the API did not recognise the name; otherwise a
  // parseable category is what makes the assessment usable.
  const explicitlyMissing = foundRaw === false;
  const found = !explicitlyMissing && category !== null;

  return {
    taxonId: safeTaxonId,
    scientificName,
    statusCode: category,
    populationTrend: normalizeTrend(record.population_trend ?? record.populationTrend),
    assessedAt: normalizeAssessedAt(record.assessment_date ?? record.assessmentDate),
    found,
  };
}

/**
 * Parses a whole `/taxa/scientific_name` response body into a map keyed by
 * lower-cased scientific name. Unparsable entries are skipped.
 */
export function parseTaxaResponse(body: unknown): Map<string, IucnAssessment> {
  const results = new Map<string, IucnAssessment>();
  if (typeof body !== 'object' || body === null) return results;

  const record = body as Record<string, unknown>;
  const candidates: unknown[] = Array.isArray(record.species)
    ? record.species
    : Array.isArray(body)
      ? (body as unknown[])
      : [record];

  for (const candidate of candidates) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const assessment = parseTaxon(candidate);
    if (!assessment.scientificName) continue;
    results.set(assessment.scientificName.toLowerCase(), assessment);
  }

  return results;
}

// ── HTTP client ──────────────────────────────────────────────────────────────

export interface FetchIucnOptions {
  token?: string | null;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

/**
 * Fetches IUCN assessments for up to {@link IUCN_MAX_NAMES_PER_REQUEST}
 * scientific names in a single request. Returns a map keyed by lower-cased
 * scientific name; names the API did not recognise are simply absent.
 */
export async function fetchIucnAssessments(
  scientificNames: string[],
  options: FetchIucnOptions = {}
): Promise<Map<string, IucnAssessment>> {
  const token = options.token ?? process.env.IUCN_RED_LIST_API_TOKEN;
  if (!token) {
    throw new IucnApiError('IUCN_RED_LIST_API_TOKEN is not configured');
  }

  const names = scientificNames.map((name) => name.trim()).filter(Boolean);
  const results = new Map<string, IucnAssessment>();

  // Chunked so we never exceed the API's per-request name limit.
  for (let index = 0; index < names.length; index += IUCN_MAX_NAMES_PER_REQUEST) {
    const chunk = names.slice(index, index + IUCN_MAX_NAMES_PER_REQUEST);
    const url = new URL(`${options.baseUrl ?? IUCN_API_BASE_URL}/taxa/scientific_name`);
    for (const name of chunk) {
      url.searchParams.append('scientific_name', name);
    }

    const response = await (options.fetchImpl ?? fetch)(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new IucnApiError(`IUCN Red List API responded ${response.status}`, response.status);
    }

    const parsed = parseTaxaResponse(await response.json());
    for (const [key, value] of parsed) {
      results.set(key, value);
    }
  }

  return results;
}
