import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/email/sendgrid', () => ({
  sendSpeciesConservationAlertEmail: vi.fn().mockResolvedValue(undefined),
  isEmailConfigured: () => true,
}));

import {
  checkOneSpecies,
  fetchSponsorsForSpecies,
  fetchSpeciesNeedingCheck,
  insertConservationAlerts,
  runConservationCheck,
} from '../conservation-checker';
import type { IucnAssessment } from '../iucn';

const pool = { query: mockQuery } as unknown as Pool;

function assessment(overrides: Partial<IucnAssessment> = {}): IucnAssessment {
  return {
    taxonId: 194451,
    scientificName: 'Milicia excelsa',
    statusCode: 'EN',
    populationTrend: 'Decreasing',
    assessedAt: '2018-06-30T00:00:00.000Z',
    found: true,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('fetchSpeciesNeedingCheck', () => {
  it('passes the quarter and maps the cached status', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          slug: 'iroko',
          common_name: 'Iroko',
          scientific_name: 'Milicia excelsa',
          last_status_code: 'VU',
        },
        {
          slug: 'teak',
          common_name: 'Teak',
          scientific_name: 'Tectona grandis',
          last_status_code: null,
        },
      ],
    });

    const species = await fetchSpeciesNeedingCheck(pool, '2026-Q4');

    expect(mockQuery.mock.calls[0][1]).toEqual(['2026-Q4']);
    expect(species).toEqual([
      {
        slug: 'iroko',
        commonName: 'Iroko',
        scientificName: 'Milicia excelsa',
        previousStatusCode: 'VU',
      },
      {
        slug: 'teak',
        commonName: 'Teak',
        scientificName: 'Tectona grandis',
        previousStatusCode: null,
      },
    ]);
  });

  it('applies a limit when one is supplied', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await fetchSpeciesNeedingCheck(pool, '2026-Q4', 5);
    expect(mockQuery.mock.calls[0][1]).toEqual(['2026-Q4', 5]);
    expect(mockQuery.mock.calls[0][0]).toContain('LIMIT $2');
  });

  it('drops an unusable cached status', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          slug: 'iroko',
          common_name: 'Iroko',
          scientific_name: 'Milicia excelsa',
          last_status_code: 'bogus',
        },
      ],
    });

    const [entry] = await fetchSpeciesNeedingCheck(pool, '2026-Q4');
    expect(entry.previousStatusCode).toBeNull();
  });
});

describe('fetchSponsorsForSpecies', () => {
  it('groups live trees by sponsor wallet', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { sponsor_wallet: 'GAAA', tree_count: 4 },
        { sponsor_wallet: 'GBBB', tree_count: 1 },
        { sponsor_wallet: null, tree_count: 9 },
      ],
    });

    const sponsors = await fetchSponsorsForSpecies(pool, 'iroko');

    expect(mockQuery.mock.calls[0][1]).toEqual(['iroko']);
    expect(sponsors).toEqual([
      { sponsorWallet: 'GAAA', treeCount: 4 },
      { sponsorWallet: 'GBBB', treeCount: 1 },
    ]);
  });
});

describe('insertConservationAlerts', () => {
  it('writes one row per sponsor with ON CONFLICT DO NOTHING', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 2 });

    const created = await insertConservationAlerts(pool, {
      speciesSlug: 'iroko',
      commonName: 'Iroko',
      scientificName: 'Milicia excelsa',
      change: { kind: 'upgraded', previousStatusCode: 'VU', newStatusCode: 'EN' },
      populationTrend: 'Decreasing',
      checkQuarter: '2026-Q4',
      sponsors: [
        { sponsorWallet: 'GAAA', treeCount: 2 },
        { sponsorWallet: 'GBBB', treeCount: 1 },
      ],
    });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain(
      'ON CONFLICT (species_slug, sponsor_wallet, new_status_code, check_quarter)'
    );
    expect(sql).toContain('DO NOTHING');
    expect(params).toHaveLength(20);
    expect(created).toBe(2);
  });

  it('short-circuits when nobody sponsors the species', async () => {
    const created = await insertConservationAlerts(pool, {
      speciesSlug: 'iroko',
      commonName: 'Iroko',
      scientificName: 'Milicia excelsa',
      change: { kind: 'newly_listed', previousStatusCode: null, newStatusCode: 'EN' },
      populationTrend: null,
      checkQuarter: '2026-Q4',
      sponsors: [],
    });

    expect(created).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('checkOneSpecies', () => {
  it('upserts the assessment and raises an alert when a species is newly listed', async () => {
    // upsertSpeciesStatus -> fetchSponsorsForSpecies -> insertConservationAlerts
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1 }) // upsert
      .mockResolvedValueOnce({ rows: [{ sponsor_wallet: 'GAAA', tree_count: 3 }] })
      .mockResolvedValueOnce({ rowCount: 1 }); // insert

    const { outcome, alertsCreated } = await checkOneSpecies(
      pool,
      {
        slug: 'iroko',
        commonName: 'Iroko',
        scientificName: 'Milicia excelsa',
        previousStatusCode: null,
      },
      assessment(),
      '2026-Q4'
    );

    expect(outcome.change).toEqual({
      kind: 'newly_listed',
      previousStatusCode: null,
      newStatusCode: 'EN',
    });
    expect(outcome.priority).toBe('high');
    expect(alertsCreated).toBe(1);
    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO species_iucn_status');
  });

  it('treats a severity increase within threatened as an upgrade', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 0 });

    const { outcome } = await checkOneSpecies(
      pool,
      {
        slug: 'iroko',
        commonName: 'Iroko',
        scientificName: 'Milicia excelsa',
        previousStatusCode: 'VU',
      },
      assessment({ statusCode: 'EN' }),
      '2026-Q4'
    );

    expect(outcome.change?.kind).toBe('upgraded');
  });

  it('does not alert when the category is unchanged', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // upsert only

    const { outcome, alertsCreated } = await checkOneSpecies(
      pool,
      {
        slug: 'iroko',
        commonName: 'Iroko',
        scientificName: 'Milicia excelsa',
        previousStatusCode: 'EN',
      },
      assessment({ statusCode: 'EN' }),
      '2026-Q4'
    );

    expect(outcome.change).toBeNull();
    expect(outcome.skippedBecause).toBe('unchanged');
    expect(alertsCreated).toBe(0);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('does not alert when a threatened species is downgraded', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const { outcome } = await checkOneSpecies(
      pool,
      {
        slug: 'iroko',
        commonName: 'Iroko',
        scientificName: 'Milicia excelsa',
        previousStatusCode: 'CR',
      },
      assessment({ statusCode: 'VU' }),
      '2026-Q4'
    );

    expect(outcome.change).toBeNull();
  });

  it('marks the species checked without guessing when IUCN has no category', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const { outcome, alertsCreated } = await checkOneSpecies(
      pool,
      {
        slug: 'mystery',
        commonName: 'Mystery',
        scientificName: 'Incertae sedis',
        previousStatusCode: null,
      },
      assessment({ statusCode: null, found: false, scientificName: 'Incertae sedis' }),
      '2026-Q4'
    );

    expect(outcome.skippedBecause).toBe('not_found_in_iucn');
    expect(outcome.newStatusCode).toBeNull();
    expect(alertsCreated).toBe(0);
    expect(mockQuery.mock.calls[0][0]).toContain('last_check_quarter = $2');
  });
});

describe('runConservationCheck', () => {
  it('skips the quarter without inventing a status when no API token is set', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          slug: 'iroko',
          common_name: 'Iroko',
          scientific_name: 'Milicia excelsa',
          last_status_code: null,
        },
      ],
    });

    const summary = await runConservationCheck(pool, { token: '', sendEmails: false });

    expect(summary.speciesExamined).toBe(0);
    expect(summary.alertsCreated).toBe(0);
    expect(summary.errors).toContain('IUCN_RED_LIST_API_TOKEN is not configured');
    // Nothing is stamped as checked, so the next run retries the species.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('does not stamp anything when the IUCN request fails', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          slug: 'iroko',
          common_name: 'Iroko',
          scientific_name: 'Milicia excelsa',
          last_status_code: null,
        },
      ],
    });

    const fetchImpl = () => jsonResponse({ error: 'boom' }, 500);

    const summary = await runConservationCheck(pool, {
      token: 'test-token',
      fetchImpl,
      sendEmails: false,
    });

    expect(summary.alertsCreated).toBe(0);
    expect(summary.errors.some((error) => error.includes('IUCN lookup failed'))).toBe(true);
    // Only the species-selection query ran — no status upsert, no alert insert.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('creates one alert per sponsor for a newly listed species', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            slug: 'iroko',
            common_name: 'Iroko',
            scientific_name: 'Milicia excelsa',
            last_status_code: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 }) // upsert
      .mockResolvedValueOnce({ rows: [{ sponsor_wallet: 'GAAA', tree_count: 2 }] })
      .mockResolvedValueOnce({ rowCount: 1 }); // insert

    const fetchImpl = () =>
      jsonResponse({
        species: [
          {
            result: true,
            taxonid: 194451,
            scientific_name: 'Milicia excelsa',
            category: 'EN',
            population_trend: 'decreasing',
          },
        ],
      });

    const summary = await runConservationCheck(pool, {
      token: 'test-token',
      fetchImpl,
      quarter: '2026-Q4',
      sendEmails: false,
      log: () => {},
    });

    expect(summary.quarter).toBe('2026-Q4');
    expect(summary.alertsCreated).toBe(1);
    expect(summary.emailsSent).toBe(0);
    expect(summary.changes).toHaveLength(1);
    expect(summary.changes[0].change?.kind).toBe('newly_listed');
    expect(summary.changes[0].priority).toBe('high');
  });

  it('ignores species the IUCN API does not know', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            slug: 'mystery',
            common_name: 'Mystery',
            scientific_name: 'Incertae sedis',
            last_status_code: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 }); // "marked checked" update

    const fetchImpl = () => jsonResponse({ species: [] });

    const summary = await runConservationCheck(pool, {
      token: 'test-token',
      fetchImpl,
      quarter: '2026-Q4',
      sendEmails: false,
      log: () => {},
    });

    expect(summary.alertsCreated).toBe(0);
    expect(summary.speciesSkipped).toBe(1);
    expect(summary.changes[0].skippedBecause).toBe('not_found_in_iucn');
  });
});
