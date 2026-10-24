import { describe, expect, it } from 'vitest';
import {
  IUCN_MAX_NAMES_PER_REQUEST,
  IucnApiError,
  fetchIucnAssessments,
  normalizeAssessedAt,
  normalizeCategory,
  normalizeTrend,
  parseTaxaResponse,
  parseTaxon,
} from '../iucn';

describe('normalizeCategory', () => {
  it('accepts known codes case-insensitively', () => {
    expect(normalizeCategory('en')).toBe('EN');
    expect(normalizeCategory('VU')).toBe('VU');
  });

  it('rejects unknown or empty values', () => {
    expect(normalizeCategory('Vulnerable')).toBeNull();
    expect(normalizeCategory('')).toBeNull();
    expect(normalizeCategory(undefined)).toBeNull();
  });
});

describe('normalizeTrend', () => {
  it('normalises both casing styles used by the API', () => {
    expect(normalizeTrend('decreasing')).toBe('Decreasing');
    expect(normalizeTrend('Decreasing')).toBe('Decreasing');
    expect(normalizeTrend('unknown')).toBe('Unknown');
  });

  it('returns null for anything unrecognised', () => {
    expect(normalizeTrend('wobbling')).toBeNull();
    expect(normalizeTrend(42)).toBeNull();
  });
});

describe('normalizeAssessedAt', () => {
  it('converts ISO strings to a canonical timestamp', () => {
    expect(normalizeAssessedAt('2018-06-30T00:00:00.000Z')).toBe('2018-06-30T00:00:00.000Z');
  });

  it('returns null for unusable input', () => {
    expect(normalizeAssessedAt('not-a-date')).toBeNull();
    expect(normalizeAssessedAt('')).toBeNull();
    expect(normalizeAssessedAt(null)).toBeNull();
  });
});

describe('parseTaxon', () => {
  it('parses a v4 assessment record', () => {
    const assessment = parseTaxon({
      result: true,
      taxonid: 194451,
      scientific_name: 'Milicia excelsa',
      category: 'VU',
      population_trend: 'decreasing',
      assessment_date: '2018-06-30T00:00:00.000Z',
    });

    expect(assessment).toEqual({
      taxonId: 194451,
      scientificName: 'Milicia excelsa',
      statusCode: 'VU',
      populationTrend: 'Decreasing',
      assessedAt: '2018-06-30T00:00:00.000Z',
      found: true,
    });
  });

  it('marks an unrecognised name as not found', () => {
    const assessment = parseTaxon({ result: false, scientific_name: 'Fake species' });
    expect(assessment.found).toBe(false);
    expect(assessment.statusCode).toBeNull();
  });

  it('tolerates a missing taxon id and malformed dates', () => {
    const assessment = parseTaxon({ scientific_name: 'Tectona grandis', category: 'VU' });
    expect(assessment.taxonId).toBeNull();
    expect(assessment.assessedAt).toBeNull();
  });

  it('ignores non-object input', () => {
    expect(parseTaxon(null).scientificName).toBe('');
    expect(parseTaxon('VU').statusCode).toBeNull();
  });
});

describe('parseTaxaResponse', () => {
  it('keys results by lower-cased scientific name', () => {
    const parsed = parseTaxaResponse({
      species: [
        { result: true, taxonid: 1, scientific_name: 'Milicia excelsa', category: 'VU' },
        { result: true, taxonid: 2, scientific_name: 'Vitellaria paradoxa', category: 'VU' },
      ],
    });

    expect(parsed.size).toBe(2);
    expect(parsed.get('milicia excelsa')?.taxonId).toBe(1);
    expect(parsed.get('vitellaria paradoxa')?.statusCode).toBe('VU');
  });

  it('returns an empty map for unusable bodies', () => {
    expect(parseTaxaResponse(null).size).toBe(0);
    expect(parseTaxaResponse({ species: 'nope' }).size).toBe(0);
  });
});

describe('fetchIucnAssessments', () => {
  it('throws when no token is configured', async () => {
    await expect(fetchIucnAssessments(['Milicia excelsa'], { token: '' })).rejects.toBeInstanceOf(
      IucnApiError
    );
  });

  it('batches names and surfaces results keyed by scientific name', async () => {
    const calls: string[] = [];
    const fetchImpl = (url: string) => {
      calls.push(url);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            species: [
              { result: true, taxonid: 7, scientific_name: 'Milicia excelsa', category: 'EN' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    };

    const result = await fetchIucnAssessments(['Milicia excelsa'], {
      token: 'test-token',
      fetchImpl,
    });

    expect(result.get('milicia excelsa')?.statusCode).toBe('EN');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('scientific_name=Milicia+excelsa');
  });

  it('splits large requests at the API name limit', async () => {
    let requests = 0;
    const fetchImpl = () => {
      requests += 1;
      return Promise.resolve(new Response(JSON.stringify({ species: [] }), { status: 200 }));
    };

    await fetchIucnAssessments(
      Array.from({ length: IUCN_MAX_NAMES_PER_REQUEST + 1 }, (_, i) => `Species ${i}`),
      { token: 'test-token', fetchImpl }
    );

    expect(requests).toBe(2);
  });

  it('throws an IucnApiError carrying the status code on a failed response', async () => {
    const fetchImpl = () => Promise.resolve(new Response('nope', { status: 401 }));

    await expect(
      fetchIucnAssessments(['Milicia excelsa'], { token: 'bad', fetchImpl })
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});
