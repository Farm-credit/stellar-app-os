import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query }) }));

import {
  listMethodologies,
  getMethodologyBySlug,
  listMethodologiesQuerySchema,
} from './carbonMethodologies';

const row = {
  slug: 'vm0047',
  code: 'VM0047',
  name: 'Afforestation, Reforestation, and Revegetation',
  category: 'reforestation',
  standard: 'Verra VCS',
  version: '1.1',
  description: 'd',
  formula: 'f',
  parameters: [{ symbol: 'x', name: 'x', unit: 'u', description: 'd' }],
  applicability: ['a'],
  source_ref: 's',
  metadata_verified: true,
};

beforeEach(() => query.mockReset());

describe('listMethodologiesQuerySchema', () => {
  it('applies defaults', () => {
    expect(listMethodologiesQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
  });
  it('coerces numeric strings', () => {
    expect(listMethodologiesQuerySchema.parse({ limit: '5', offset: '10' })).toMatchObject({
      limit: 5,
      offset: 10,
    });
  });
  it('rejects unknown categories and oversized limits', () => {
    expect(listMethodologiesQuerySchema.safeParse({ category: 'nope' }).success).toBe(false);
    expect(listMethodologiesQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(listMethodologiesQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
  });
});

describe('listMethodologies', () => {
  it('maps rows to camelCase and returns paging info', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: 1 }] }).mockResolvedValueOnce({ rows: [row] });
    const result = await listMethodologies({ limit: 20, offset: 0 });
    expect(result.totalCount).toBe(1);
    expect(result.methodologies[0]).toMatchObject({
      slug: 'vm0047',
      sourceRef: 's',
      metadataVerified: true,
    });
    expect(result).toMatchObject({ limit: 20, offset: 0 });
  });

  it('parameterises filters and never interpolates user input', async () => {
    query.mockResolvedValue({ rows: [{ total: 0 }] });
    await listMethodologies({
      category: 'reforestation',
      standard: 'CDM',
      q: "100%_'; DROP TABLE x;--",
      limit: 10,
      offset: 5,
    });
    const [countSql, countParams] = query.mock.calls[0];
    expect(countSql).toContain('category = $1');
    expect(countSql).toContain('LOWER(standard) = LOWER($2)');
    expect(countSql).not.toContain('DROP TABLE');
    expect(countParams[2]).toBe("%100\\%\\_'; DROP TABLE x;--%");
    const [pageSql, pageParams] = query.mock.calls[1];
    expect(pageSql).toContain('LIMIT $4 OFFSET $5');
    expect(pageParams.slice(-2)).toEqual([10, 5]);
  });
});

describe('getMethodologyBySlug', () => {
  it('returns null when not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await getMethodologyBySlug('missing')).toBeNull();
  });
  it('returns the mapped methodology', async () => {
    query.mockResolvedValueOnce({ rows: [row] });
    expect((await getMethodologyBySlug('vm0047'))?.code).toBe('VM0047');
  });
});
