import { describe, expect, it } from 'vitest';
import { addCorporateOrder } from '@/lib/corporate-sponsorship/store';
import { POST as importEmployees } from '../import/route';
import { GET } from './route';

describe('API /api/corporate-sponsorship/employees/report', () => {
  it('returns the latest confirmation summary as a CSV download', async () => {
    const order = addCorporateOrder({
      quantity: 10,
      branding: {
        companyName: 'Acme Green Ventures',
        primaryColor: '#166534',
        secondaryColor: '#0f766e',
        contactEmail: 'sustainability@acmegreen.example',
      },
    });

    const csv = 'name,email,tree_count\nAmara Okafor,amara@example.com,2\n';
    await importEmployees(
      new Request('http://localhost/api/corporate-sponsorship/employees/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, csv, sendEmails: false }),
      })
    );

    const res = await GET(
      new Request(`http://localhost/api/corporate-sponsorship/employees/report?orderId=${order.id}`)
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');

    const body = await res.text();
    expect(body).toContain('employee_name,employee_email,department,trees_assigned');
    expect(body).toContain('Amara Okafor,amara@example.com,');
  });

  it('returns 400 without an orderId and 404 when no summary exists', async () => {
    const missingParam = await GET(
      new Request('http://localhost/api/corporate-sponsorship/employees/report')
    );
    expect(missingParam.status).toBe(400);

    const noSummary = await GET(
      new Request(
        'http://localhost/api/corporate-sponsorship/employees/report?orderId=order-without-import'
      )
    );
    expect(noSummary.status).toBe(404);
  });
});
