// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Comparison share/export helper tests
 * Issue #1354: shareable comparison links and CSV export.
 */

import {
  buildComparisonSearch,
  buildComparisonUrl,
  comparisonFileName,
  downloadFile,
  parseComparisonParams,
  toComparisonCsv,
} from './comparisonExport';
import {
  DEFAULT_COMPARISON_CRITERIA,
  MAX_COMPARE_PROJECTS,
  getComparisonProjects,
  type ComparisonCriterionId,
} from './projectComparison';

const selection = getComparisonProjects(['proj-001', 'proj-004']);

describe('parseComparisonParams', () => {
  it('reads ids and columns from a query string', () => {
    const result = parseComparisonParams('ids=proj-001,proj-004&cols=name,pricePerTon');
    expect(result.ids).toEqual(['proj-001', 'proj-004']);
    expect(result.criteria).toEqual(['name', 'pricePerTon']);
  });

  it('accepts a leading question mark and a URLSearchParams instance', () => {
    expect(parseComparisonParams('?ids=proj-002').ids).toEqual(['proj-002']);
    expect(
      parseComparisonParams(new URLSearchParams({ ids: 'proj-003', cols: 'verifier' }))
    ).toEqual({ ids: ['proj-003'], criteria: ['verifier'] });
  });

  it('trims, de-duplicates and caps ids', () => {
    const result = parseComparisonParams(
      'ids= a , b ,a,,c,d,e,f&cols=name'
    );
    expect(result.ids).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.ids).toHaveLength(MAX_COMPARE_PROJECTS);
  });

  it('drops unknown columns and returns them in canonical order', () => {
    expect(parseComparisonParams('ids=a,b&cols=buyerReviews,not-a-column,name').criteria).toEqual([
      'name',
      'buyerReviews',
    ]);
  });

  it('falls back to the default columns when none are requested', () => {
    expect(parseComparisonParams('ids=a,b').criteria).toEqual([...DEFAULT_COMPARISON_CRITERIA]);
    expect(parseComparisonParams('').criteria).toEqual([...DEFAULT_COMPARISON_CRITERIA]);
    expect(parseComparisonParams('').ids).toEqual([]);
  });
});

describe('buildComparisonSearch', () => {
  it('serialises a selection', () => {
    expect(buildComparisonSearch({ ids: ['proj-001', 'proj-004'], criteria: ['name'] })).toBe(
      'ids=proj-001%2Cproj-004&cols=name'
    );
  });

  it('omits empty parts', () => {
    expect(buildComparisonSearch({})).toBe('');
    expect(buildComparisonSearch({ ids: ['proj-001'] })).toBe('ids=proj-001');
    expect(buildComparisonSearch({ criteria: ['name', 'verifier'] })).toBe('cols=name%2Cverifier');
  });

  it('de-duplicates and caps ids before serialising', () => {
    const search = buildComparisonSearch({ ids: ['a', 'a', 'b', 'c', 'd', 'e', 'f'] });
    expect(search).toBe('ids=a%2Cb%2Cc%2Cd%2Ce');
  });

  it('round-trips with parseComparisonParams', () => {
    const criteria: ComparisonCriterionId[] = ['methodology', 'riskRating', 'buyerReviews'];
    const search = buildComparisonSearch({ ids: ['proj-001', 'proj-005'], criteria });
    expect(parseComparisonParams(search)).toEqual({
      ids: ['proj-001', 'proj-005'],
      criteria: ['methodology', 'riskRating', 'buyerReviews'],
    });
  });
});

describe('buildComparisonUrl', () => {
  it('builds an absolute shareable link', () => {
    expect(
      buildComparisonUrl({ ids: ['proj-001', 'proj-002'], criteria: ['name'] }, 'https://example.org')
    ).toBe('https://example.org/projects/compare?ids=proj-001%2Cproj-002&cols=name');
  });

  it('honours a custom path and omits the query when empty', () => {
    expect(buildComparisonUrl({}, 'https://example.org', '/compare')).toBe(
      'https://example.org/compare'
    );
  });
});

describe('toComparisonCsv', () => {
  it('writes a header row plus one row per column', () => {
    const csv = toComparisonCsv(selection, ['name', 'pricePerTon', 'riskRating']);
    const rows = csv.split('\r\n');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toBe('"criteria","Amazon Rainforest Reforestation","Mangrove Restoration - Indonesia"');
    expect(rows[1]).toBe('"Project Name","Amazon Rainforest Reforestation","Mangrove Restoration - Indonesia"');
    expect(rows[2]).toBe('"Price / Ton","$45.50","$55.75"');
    expect(rows[3]).toBe('"Risk Rating","low","medium"');
  });

  it('escapes embedded quotes and commas', () => {
    const [project] = selection;
    const csv = toComparisonCsv([{ ...project, name: 'A, "B" Ltd' }], ['name']);
    expect(csv.split('\r\n')[1]).toBe('"Project Name","A, ""B"" Ltd"');
  });

  it('joins list-valued cells with semicolons', () => {
    const csv = toComparisonCsv(selection.slice(0, 1), ['certification', 'coBenefits']);
    expect(csv).toContain('"VCS; CCB"');
    expect(csv).toContain('"Biodiversity; Water; Community"');
  });

  it('falls back to the default columns when given none or invalid ones', () => {
    const csv = toComparisonCsv(selection, []);
    const fallback = toComparisonCsv(selection, [...DEFAULT_COMPARISON_CRITERIA]);
    expect(csv).toBe(fallback);
    expect(csv.split('\r\n')).toHaveLength(DEFAULT_COMPARISON_CRITERIA.length + 1);
  });

  it('still produces a valid file when nothing is selected', () => {
    expect(toComparisonCsv([], ['name'])).toBe('"criteria"');
  });
});

describe('comparisonFileName', () => {
  it('names the export after the selected projects and the date', () => {
    expect(comparisonFileName(['proj-001', 'proj-004'], new Date('2026-09-27T10:00:00Z'))).toBe(
      'comparison-proj-001-proj-004-2026-09-27.csv'
    );
  });

  it('handles an empty selection', () => {
    expect(comparisonFileName([], new Date('2026-09-27T10:00:00Z'))).toBe(
      'comparison-empty-2026-09-27.csv'
    );
  });
});

describe('downloadFile', () => {
  it('is a no-op outside the browser', () => {
    expect(() => downloadFile('a,b', 'x.csv', 'text/csv')).not.toThrow();
  });
});
