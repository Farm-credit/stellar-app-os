import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/projects/[id]/water-impact', () => {
  it('returns an explicit empty assessment state for a known project', async () => {
    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'proj-001' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      projectId: 'proj-001',
      hasData: false,
      assessments: [],
    });
  });

  it('rejects unknown projects without exposing an assessment payload', async () => {
    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'missing-project' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Project not found' });
  });
});
