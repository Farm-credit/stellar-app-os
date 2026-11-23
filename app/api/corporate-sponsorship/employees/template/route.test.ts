import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('API /api/corporate-sponsorship/employees/template', () => {
  it('serves a branded, downloadable employee CSV template', async () => {
    const res = await GET(
      new Request(
        'http://localhost/api/corporate-sponsorship/employees/template?companyName=Acme%20Green'
      )
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-disposition')).toContain('employee-sponsorship-template.csv');

    const body = await res.text();
    expect(body).toContain('Acme Green employee tree sponsorship import');
    expect(body).toContain('name,email,department,tree_count');
  });
});
