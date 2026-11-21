import { describe, expect, it } from 'vitest';
import { GET as LIST, POST as APPLY } from '@/app/api/v2/marketplace/financing/route';
import { GET, POST } from '@/app/api/v2/marketplace/financing/[id]/repayments/route';

const BASE = 'http://localhost:3000/api/v2/marketplace/financing';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function post(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/v2/marketplace/financing v2 (#1414)', () => {
  it('GET adds a credit-limit quote when land details are supplied', async () => {
    const res = await LIST(
      new Request(`${BASE}?landSizeHectares=5&region=africa&practiceType=agroforestry`)
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.eligibility.creditLimit).toBeGreaterThan(0);
    expect(data.eligibility.horizonYears).toBe(3);
  });

  it('GET rejects partial land details', async () => {
    const res = await LIST(new Request(`${BASE}?landSizeHectares=5`));
    expect(res.status).toBe(400);
  });

  it('POST underwrites against the land when details are supplied', async () => {
    const res = await APPLY(
      post(BASE, {
        farmerId: 'farmer-underwritten',
        projectName: 'Small plot',
        requestedAmount: 1_000_000,
        landSizeHectares: 2,
        region: 'africa',
        practiceType: 'no-till',
      })
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.creditLine.approvedAmount).toBe(data.creditLine.creditLimit);
    expect(data.creditLine.approvedAmount).toBeLessThan(1_000_000);
  });
});

describe('/api/v2/marketplace/financing/:id/repayments (#1414)', () => {
  it('applies carbon sale proceeds and lists the history', async () => {
    const created = await (
      await APPLY(
        post(BASE, { farmerId: 'farmer-repay', projectName: 'Repay test', requestedAmount: 800 })
      )
    ).json();
    const id = created.creditLine.id as string;

    const res = await POST(
      post(`${BASE}/${id}/repayments`, { saleReference: 'sale-1', saleProceeds: 1_000 }),
      params(id)
    );
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.repaymentApplied).toBe(500);
    expect(data.farmerPayout).toBe(500);
    expect(data.creditLine.outstandingAmount).toBe(300);

    const history = await (await GET(new Request(`${BASE}/${id}/repayments`), params(id))).json();
    expect(history.outstandingAmount).toBe(300);
    expect(history.repayments).toHaveLength(1);
  });

  it('returns 409 when a sale is applied twice', async () => {
    const res = await POST(
      post(`${BASE}/cc-line-002/repayments`, {
        saleReference: 'sale-2024-0612',
        saleProceeds: 7_000,
      }),
      params('cc-line-002')
    );
    expect(res.status).toBe(409);
  });

  it('returns 404 for an unknown line', async () => {
    const res = await GET(new Request(`${BASE}/nope/repayments`), params('nope'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid proceeds', async () => {
    const res = await POST(
      post(`${BASE}/cc-line-001/repayments`, { saleReference: 'bad', saleProceeds: 'lots' }),
      params('cc-line-001')
    );
    expect(res.status).toBe(400);
  });
});
