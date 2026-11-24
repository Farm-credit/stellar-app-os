import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-pdf/renderer', () => {
  const Component = ({ children }: { children?: unknown }) => children ?? null;
  return {
    Document: Component,
    Page: Component,
    Text: Component,
    View: Component,
    StyleSheet: { create: (styles: unknown) => styles },
    renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.7 biodiversity')),
  };
});

import { renderToBuffer } from '@react-pdf/renderer';

import { getProjectBiodiversityReports } from '@/lib/biodiversity/impact-report';
import { resetWildlifeStore, seedProjectWildlife } from '@/lib/wildlife/service';
import { GET } from './route';

function call(id: string, year: string) {
  return GET(
    new Request(`http://localhost/api/projects/${id}/biodiversity-report/${year}/pdf`) as never,
    {
      params: Promise.resolve({ id, year }),
    }
  );
}

describe('GET /api/projects/[id]/biodiversity-report/[year]/pdf', () => {
  beforeEach(() => {
    resetWildlifeStore();
    vi.mocked(renderToBuffer).mockClear();
  });

  it('renders a downloadable PDF for a year with field data', async () => {
    seedProjectWildlife('proj-001');
    const [report] = getProjectBiodiversityReports('proj-001');
    expect(report).toBeDefined();

    const response = await call('proj-001', String(report.year));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="biodiversity-report-proj-001-${report.year}.pdf"`
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(renderToBuffer).toHaveBeenCalledOnce();

    const body = Buffer.from(await response.arrayBuffer()).toString('utf8');
    expect(body).toContain('%PDF');
  });

  it('rejects an invalid year', async () => {
    const response = await call('proj-001', '1999');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('year must be an integer'),
    });
  });

  it('returns 404 when the year has no field survey data', async () => {
    const response = await call('proj-001', '2001');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'no_survey_data' });
    expect(renderToBuffer).not.toHaveBeenCalled();
  });

  it('rejects unknown projects', async () => {
    const response = await call('missing-project', '2025');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Project not found' });
  });
});
