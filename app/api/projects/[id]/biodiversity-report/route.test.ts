import { beforeEach, describe, expect, it } from 'vitest';

import { getProjectBiodiversityReports } from '@/lib/biodiversity/impact-report';
import { resetWildlifeStore } from '@/lib/wildlife/service';
import { GET } from './route';

function call(path: string, id: string) {
  return GET(new Request(`http://localhost${path}`) as never, {
    params: Promise.resolve({ id }),
  });
}

describe('GET /api/projects/[id]/biodiversity-report', () => {
  beforeEach(() => {
    resetWildlifeStore();
  });

  it('returns annual reports and the cadence for a known project', async () => {
    const response = await call('/api/projects/proj-001/biodiversity-report', 'proj-001');
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(payload.projectId).toBe('proj-001');
    expect(payload.methodology.length).toBeGreaterThan(0);
    expect(payload.cadence.currentReportYear).toBe(new Date().getUTCFullYear());
    expect(payload.cadence.finalizationDate).toBe(
      `${new Date().getUTCFullYear() + 1}-01-01T00:00:00.000Z`
    );
    expect(Array.isArray(payload.reports)).toBe(true);
    expect(payload.reports.length).toBeGreaterThan(0);
    for (const report of payload.reports) {
      expect(report.projectId).toBe('proj-001');
      expect(report.pdfUrl).toBe(`/api/projects/proj-001/biodiversity-report/${report.year}/pdf`);
    }
  });

  it('resolves a project by slug as well as by id', async () => {
    const bySlug = await call(
      '/api/projects/amazon-rainforest-reforestation/biodiversity-report',
      'amazon-rainforest-reforestation'
    );
    const byId = await call('/api/projects/proj-001/biodiversity-report', 'proj-001');

    expect(bySlug.status).toBe(200);
    const slugPayload = await bySlug.json();
    expect(slugPayload.projectId).toBe(byId.status === 200 ? (await byId.json()).projectId : null);
    expect(slugPayload.projectId).not.toBe('amazon-rainforest-reforestation');
  });

  it('filters to a single year when ?year is supplied', async () => {
    const all = await call('/api/projects/proj-001/biodiversity-report', 'proj-001');
    const { reports } = await all.json();
    const year = reports[0].year as number;

    const response = await call(
      `/api/projects/proj-001/biodiversity-report?year=${year}`,
      'proj-001'
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.reports).toHaveLength(1);
    expect(payload.reports[0].year).toBe(year);
  });

  it('rejects an invalid year with 400', async () => {
    const response = await call('/api/projects/proj-001/biodiversity-report?year=1999', 'proj-001');
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe('invalid_year');
  });

  it('returns 404 when the requested year has no field data', async () => {
    const response = await call('/api/projects/proj-001/biodiversity-report?year=2001', 'proj-001');
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.code).toBe('no_survey_data');
  });

  it('rejects unknown projects', async () => {
    const response = await call(
      '/api/projects/missing-project/biodiversity-report',
      'missing-project'
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Project not found' });
  });

  it('builds deterministic reports for the same store state', async () => {
    const first = await (
      await call('/api/projects/proj-001/biodiversity-report', 'proj-001')
    ).json();
    const second = await (
      await call('/api/projects/proj-001/biodiversity-report', 'proj-001')
    ).json();

    expect(second.reports.map((report: { year: number }) => report.year)).toEqual(
      first.reports.map((report: { year: number }) => report.year)
    );
    expect(getProjectBiodiversityReports('proj-001').length).toBe(first.reports.length);
  });
});
