import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPool, isAdminRequest } = vi.hoisted(() => ({
  getPool: vi.fn(),
  isAdminRequest: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({ getPool }));
vi.mock('@/lib/auth/admin', () => ({ isAdminRequest }));

import { GET } from './route';

const query = vi.fn();

describe('admin verification photos route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminRequest.mockResolvedValue(true);
    query.mockImplementation((sql: string) => {
      if (/COUNT\(DISTINCT pu\.id\)/i.test(sql)) {
        return { rows: [{ total: '1' }] };
      }
      if (/SELECT DISTINCT region/i.test(sql)) {
        return { rows: [{ region: 'North' }] };
      }
      if (/SELECT DISTINCT species_slug/i.test(sql)) {
        return { rows: [{ species_slug: 'oak' }] };
      }
      return {
        rows: [
          {
            id: 2,
            treeId: 7,
            treeRef: 'TREE-7',
            mediaUrl: 'https://images.example/submitted.jpg',
            baselineMediaUrl: 'https://images.example/baseline.jpg',
            baselineCreatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      };
    });
    getPool.mockReturnValue({ query });
  });

  it('rejects non-admin requests without querying the database', async () => {
    isAdminRequest.mockResolvedValue(false);

    const response = await GET(new Request('http://localhost/api/admin/verification/photos'));

    expect(response.status).toBe(401);
    expect(getPool).not.toHaveBeenCalled();
  });

  it('returns each photo with its earliest prior photo as the baseline', async () => {
    const response = await GET(
      new Request('http://localhost/api/admin/verification/photos?page=1&limit=20')
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.photos[0]).toMatchObject({
      mediaUrl: 'https://images.example/submitted.jpg',
      baselineMediaUrl: 'https://images.example/baseline.jpg',
      baselineCreatedAt: '2025-01-01T00:00:00.000Z',
    });

    const photoQuery = query.mock.calls.find(([sql]) => /baseline\.media_url/i.test(sql))?.[0];
    expect(photoQuery).toContain('LEFT JOIN LATERAL');
    expect(photoQuery).toContain('historical.created_at < pu.created_at');
    expect(photoQuery).toContain('ORDER BY historical.created_at ASC, historical.id ASC');
    expect(photoQuery).toContain("pu.metadata->>'rejected_at' IS NULL");
  });
});
