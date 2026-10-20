import { describe, expect, it } from 'vitest';

import {
  COMPARE_METRICS,
  MAX_COMPARE_MODAL_PROJECTS,
  buildCompareUrl,
  getBestProjectIds,
  getSpeciesDiversity,
  isComparable,
  normalizeCompareIds,
  parseCompareParams,
  resolveCompareOfferings,
  toggleCompareId,
} from '../projectCompareSelection';
import { getTreeSponsorshipOfferingById } from '../treeSponsorshipComparison';

const ORIGIN = 'https://example.test';

function offering(id: string) {
  const found = getTreeSponsorshipOfferingById(id);
  if (!found) throw new Error(`missing fixture offering ${id}`);
  return found;
}

describe('toggleCompareId (selection cap)', () => {
  it('adds an id while under the cap', () => {
    expect(toggleCompareId([], 'proj-001')).toEqual(['proj-001']);
    expect(toggleCompareId(['proj-001'], 'proj-004')).toEqual(['proj-001', 'proj-004']);
  });

  it('removes an id that is already selected', () => {
    expect(toggleCompareId(['proj-001', 'proj-004'], 'proj-001')).toEqual(['proj-004']);
  });

  it('does not add a fourth project', () => {
    const full = ['proj-001', 'proj-004', 'proj-006'];
    expect(full).toHaveLength(MAX_COMPARE_MODAL_PROJECTS);
    expect(toggleCompareId(full, 'proj-009')).toEqual(full);
  });

  it('still allows removing when the cap is reached', () => {
    const full = ['proj-001', 'proj-004', 'proj-006'];
    expect(toggleCompareId(full, 'proj-004')).toEqual(['proj-001', 'proj-006']);
  });
});

describe('normalizeCompareIds', () => {
  it('caps at three, drops duplicates, blanks and unknown ids', () => {
    expect(
      normalizeCompareIds([
        ' proj-001 ',
        'proj-001',
        '',
        'not-a-project',
        'proj-004',
        'proj-006',
        'proj-009',
      ])
    ).toEqual(['proj-001', 'proj-004', 'proj-006']);
  });

  it('resolves project slugs to canonical ids', () => {
    expect(normalizeCompareIds(['amazon-rainforest-reforestation'])).toEqual(['proj-001']);
  });
});

describe('isComparable', () => {
  it('is true for projects with offering data and false otherwise', () => {
    expect(isComparable('proj-001')).toBe(true);
    expect(isComparable('proj-002')).toBe(false);
  });
});

describe('shareable URL round trip', () => {
  it('builds a URL that parses back to the same selection and reopens the modal', () => {
    const ids = ['proj-001', 'proj-004', 'proj-006'];
    const url = new URL(buildCompareUrl(ids, ORIGIN));

    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe('/projects');
    expect(parseCompareParams(url.searchParams)).toEqual({ ids, open: true });
  });

  it('accepts a raw query string with or without the leading question mark', () => {
    const expected = { ids: ['proj-001', 'proj-004'], open: true };
    expect(parseCompareParams('?compare=proj-001,proj-004&compareOpen=1')).toEqual(expected);
    expect(parseCompareParams('compare=proj-001,proj-004&compareOpen=1')).toEqual(expected);
  });

  it('does not reopen the modal with fewer than two valid projects', () => {
    expect(parseCompareParams('compare=proj-001&compareOpen=1')).toEqual({
      ids: ['proj-001'],
      open: false,
    });
    expect(parseCompareParams('compare=nope,also-nope&compareOpen=1')).toEqual({
      ids: [],
      open: false,
    });
  });

  it('keeps the modal closed unless compareOpen=1 is present', () => {
    expect(parseCompareParams('compare=proj-001,proj-004').open).toBe(false);
  });

  it('caps a hand-edited URL at three projects', () => {
    const parsed = parseCompareParams(
      'compare=proj-001,proj-004,proj-006,proj-009,proj-012&compareOpen=1'
    );
    expect(parsed.ids).toEqual(['proj-001', 'proj-004', 'proj-006']);
  });

  it('returns the bare path when nothing is selected', () => {
    expect(buildCompareUrl([], ORIGIN)).toBe(`${ORIGIN}/projects`);
  });
});

describe('species diversity', () => {
  it('counts the primary species plus distinct secondary species', () => {
    // Teak + Brazilian Nut + Rosewood + Acai Palm
    expect(getSpeciesDiversity(offering('proj-001'))).toBe(4);
    // Red Mangrove + Black Mangrove + White Mangrove
    expect(getSpeciesDiversity(offering('proj-004'))).toBe(3);
  });

  it('ignores duplicates and blank names', () => {
    const base = offering('proj-001');
    const messy = {
      ...base,
      species: 'Teak',
      secondarySpecies: ['teak', ' ', 'Rosewood', 'rosewood'],
    };
    expect(getSpeciesDiversity(messy)).toBe(2);
  });

  it('is 1 when there are no secondary species', () => {
    const base = offering('proj-001');
    expect(getSpeciesDiversity({ ...base, secondarySpecies: undefined })).toBe(1);
  });
});

describe('best-value highlighting', () => {
  const offerings = resolveCompareOfferings(['proj-001', 'proj-004', 'proj-005']);
  const metric = (id: string) => {
    const found = COMPARE_METRICS.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`missing metric ${id}`);
    return found;
  };

  it('picks the highest survival rate', () => {
    expect(getBestProjectIds(offerings, metric('survivalRate'))).toEqual(['proj-001']);
  });

  it('picks the lowest cost per tree', () => {
    expect(getBestProjectIds(offerings, metric('costPerTree'))).toEqual(['proj-005']);
  });

  it('picks the highest CO2 per tree', () => {
    expect(getBestProjectIds(offerings, metric('co2PerTree'))).toEqual(['proj-001']);
  });

  it('highlights nothing for a single project or a full tie', () => {
    expect(getBestProjectIds(offerings.slice(0, 1), metric('survivalRate'))).toEqual([]);
    const tied = [offering('proj-001'), { ...offering('proj-001'), id: 'proj-copy' }];
    expect(getBestProjectIds(tied, metric('survivalRate'))).toEqual([]);
  });
});

describe('COMPARE_METRICS', () => {
  it('covers exactly the four metrics required by the issue', () => {
    expect(COMPARE_METRICS.map((metric) => metric.id)).toEqual([
      'survivalRate',
      'costPerTree',
      'speciesDiversity',
      'co2PerTree',
    ]);
  });

  it('formats values for display', () => {
    const [survival, cost, diversity, co2] = COMPARE_METRICS;
    const amazon = offering('proj-001');
    expect(survival.format(amazon)).toBe('91%');
    expect(cost.format(amazon)).toBe('$18.50');
    expect(diversity.format(amazon)).toBe('4 species');
    expect(co2.format(amazon)).toBe('22 kg CO₂/yr');
  });
});
