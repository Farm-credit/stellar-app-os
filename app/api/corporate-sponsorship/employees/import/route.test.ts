import { describe, expect, it } from 'vitest';
import { addCorporateOrder, getCorporateOrderById } from '@/lib/corporate-sponsorship/store';
import { POST } from './route';

function createOrder(quantity: number) {
  return addCorporateOrder({
    quantity,
    branding: {
      companyName: 'Acme Green Ventures',
      tagline: 'Net-Zero Operations by 2030',
      primaryColor: '#166534',
      secondaryColor: '#0f766e',
      contactEmail: 'sustainability@acmegreen.example',
    },
  });
}

function importRequest(body: unknown) {
  return new Request('http://localhost/api/corporate-sponsorship/employees/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('API /api/corporate-sponsorship/employees/import', () => {
  it('assigns trees, records employees on the order, and returns a summary report', async () => {
    const order = createOrder(10);
    const csv = [
      'name,email,department,tree_count',
      'Amara Okafor,amara@example.com,Engineering,3',
      'Liam Chen,liam@example.com,Product,2',
    ].join('\n');

    const res = await POST(importRequest({ orderId: order.id, csv, sendEmails: false }));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.summary).toMatchObject({
      orderId: order.id,
      employeesAssigned: 2,
      treesAssigned: 5,
      treesRemaining: 5,
      totalRows: 2,
      emailsSent: 0,
    });
    expect(body.summary.assignments[0]).toMatchObject({
      name: 'Amara Okafor',
      email: 'amara@example.com',
      department: 'Engineering',
      treeCount: 3,
      emailStatus: 'skipped',
    });
    expect(body.reportUrl).toBe(`/api/corporate-sponsorship/employees/report?orderId=${order.id}`);

    const updated = getCorporateOrderById(order.id);
    expect(updated?.trees.filter((tree) => tree.assignedEmployee === 'Amara Okafor')).toHaveLength(
      3
    );
    expect(
      updated?.trees.filter((tree) => tree.assignedEmployeeEmail === 'liam@example.com')
    ).toHaveLength(2);
  });

  it('rejects invalid emails without assigning any trees', async () => {
    const order = createOrder(10);
    const csv = 'name,email,tree_count\nAmara Okafor,not-an-email,2\n';

    const res = await POST(importRequest({ orderId: order.id, csv }));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toMatch(/validation failed/i);
    expect(body.errors[0].message).toMatch(/not a valid email address/);
    expect(
      getCorporateOrderById(order.id)?.trees.every((tree) => !tree.assignedEmployeeEmail)
    ).toBe(true);
  });

  it('rejects imports that request more trees than the order contains', async () => {
    const order = createOrder(10);
    const csv = 'name,email,tree_count\nAmara Okafor,amara@example.com,11\n';

    const res = await POST(importRequest({ orderId: order.id, csv }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/requests 11 trees but the order only has 10/);
  });

  it('returns 404 for unknown corporate orders', async () => {
    const res = await POST(
      importRequest({ orderId: 'missing-order', csv: 'name,email\nA,a@b.com' })
    );
    expect(res.status).toBe(404);
  });
});
