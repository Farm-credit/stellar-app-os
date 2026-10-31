import { describe, expect, it } from 'vitest';
import {
  alertPriorityFor,
  buildConservationCopy,
  categoryLabel,
  detectConservationChange,
  isThreatenedCategory,
  isIucnCategoryCode,
  iucnRecordUrl,
  previousQuarterLabel,
  quarterLabel,
  speciesEducationPath,
} from '../conservation';

describe('isThreatenedCategory', () => {
  it('treats Vulnerable, Endangered and Critically Endangered as threatened', () => {
    expect(isThreatenedCategory('VU')).toBe(true);
    expect(isThreatenedCategory('EN')).toBe(true);
    expect(isThreatenedCategory('CR')).toBe(true);
  });

  it('does not treat the remaining categories as threatened', () => {
    for (const code of ['LC', 'NT', 'DD', 'NE', 'EW', 'EX'] as const) {
      expect(isThreatenedCategory(code)).toBe(false, code);
    }
  });
});

describe('isIucnCategoryCode', () => {
  it('accepts every known code', () => {
    for (const code of ['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE']) {
      expect(isIucnCategoryCode(code)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isIucnCategoryCode('Vulnerable')).toBe(false);
    expect(isIucnCategoryCode('')).toBe(false);
    expect(isIucnCategoryCode(null)).toBe(false);
  });
});

describe('detectConservationChange', () => {
  it('flags a species with no previous assessment as a new listing when threatened', () => {
    expect(detectConservationChange(null, 'EN')).toEqual({
      kind: 'newly_listed',
      previousStatusCode: null,
      newStatusCode: 'EN',
    });
  });

  it('flags a move from a non-threatened category to a threatened one as a new listing', () => {
    expect(detectConservationChange('LC', 'VU')?.kind).toBe('newly_listed');
    expect(detectConservationChange('NT', 'CR')?.kind).toBe('newly_listed');
  });

  it('flags a move to a more severe threatened category as an upgrade', () => {
    expect(detectConservationChange('VU', 'EN')).toEqual({
      kind: 'upgraded',
      previousStatusCode: 'VU',
      newStatusCode: 'EN',
    });
    expect(detectConservationChange('EN', 'CR')?.kind).toBe('upgraded');
  });

  it('does not alert when the species stays in the same category', () => {
    expect(detectConservationChange('EN', 'EN')).toBeNull();
  });

  it('does not alert when the species becomes less threatened', () => {
    expect(detectConservationChange('CR', 'VU')).toBeNull();
    expect(detectConservationChange('EN', 'LC')).toBeNull();
  });

  it('does not alert for a species that is still not threatened', () => {
    expect(detectConservationChange(null, 'LC')).toBeNull();
    expect(detectConservationChange('DD', 'NT')).toBeNull();
  });
});

describe('alertPriorityFor', () => {
  it('is medium for Vulnerable', () => {
    expect(alertPriorityFor('VU')).toBe('medium');
  });

  it('is high for Endangered and above', () => {
    expect(alertPriorityFor('EN')).toBe('high');
    expect(alertPriorityFor('CR')).toBe('high');
  });
});

describe('quarterLabel', () => {
  it('maps UTC months to calendar quarters', () => {
    expect(quarterLabel(new Date('2026-01-15T00:00:00Z'))).toBe('2026-Q1');
    expect(quarterLabel(new Date('2026-04-01T00:00:00Z'))).toBe('2026-Q2');
    expect(quarterLabel(new Date('2026-09-30T23:59:59Z'))).toBe('2026-Q3');
    expect(quarterLabel(new Date('2026-10-22T00:00:00Z'))).toBe('2026-Q4');
  });
});

describe('previousQuarterLabel', () => {
  it('steps back one quarter', () => {
    expect(previousQuarterLabel('2026-Q4')).toBe('2026-Q3');
  });

  it('rolls the year back at Q1', () => {
    expect(previousQuarterLabel('2026-Q1')).toBe('2025-Q4');
  });

  it('rejects malformed labels', () => {
    expect(() => previousQuarterLabel('2026Q1')).toThrow();
  });
});

describe('links', () => {
  it('builds the species education path', () => {
    expect(speciesEducationPath('locust_bean')).toBe('/species/locust_bean');
  });

  it('prefers the numeric IUCN taxon URL when a taxon id is known', () => {
    expect(iucnRecordUrl(194451, 'Milicia excelsa')).toBe(
      'https://www.iucnredlist.org/species/194451'
    );
  });

  it('falls back to an IUCN search URL', () => {
    expect(iucnRecordUrl(null, 'Milicia excelsa')).toBe(
      'https://www.iucnredlist.org/search?query=Milicia%20excelsa'
    );
  });

  it('returns null when nothing is known', () => {
    expect(iucnRecordUrl(null, '')).toBeNull();
  });
});

describe('buildConservationCopy', () => {
  const base = {
    commonName: 'Iroko',
    scientificName: 'Milicia excelsa',
    populationTrend: 'Decreasing' as const,
    treeCount: 3,
    checkQuarter: '2026-Q4',
    educationUrl: 'https://harvesta.app/species/iroko',
    iucnUrl: 'https://www.iucnredlist.org/species/194451',
  };

  it('writes a newly-listed subject and links to the education page', () => {
    const copy = buildConservationCopy({
      ...base,
      change: { kind: 'newly_listed', previousStatusCode: null, newStatusCode: 'EN' },
    });

    expect(copy.subject).toBe('Iroko is now listed as Endangered on the IUCN Red List');
    expect(copy.body).toContain('Endangered');
    expect(copy.body).toContain('population is currently decreasing');
    expect(copy.body).toContain(base.educationUrl);
    expect(copy.body).toContain(base.iucnUrl);
    expect(copy.body).toContain('3 trees');
  });

  it('writes an upgraded subject naming both categories', () => {
    const copy = buildConservationCopy({
      ...base,
      treeCount: 1,
      change: { kind: 'upgraded', previousStatusCode: 'VU', newStatusCode: 'CR' },
    });

    expect(copy.subject).toBe('Iroko is now Critically Endangered on the IUCN Red List');
    expect(copy.body).toContain('Vulnerable');
    expect(copy.body).toContain('Critically Endangered');
    expect(copy.summary).toContain('1 tree');
  });
});

describe('categoryLabel', () => {
  it('expands every code', () => {
    expect(categoryLabel('CR')).toBe('Critically Endangered');
    expect(categoryLabel('VU')).toBe('Vulnerable');
    expect(categoryLabel('LC')).toBe('Least Concern');
  });
});
