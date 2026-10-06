import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoist mocks before any module is imported ─────────────────────────────────

const {
  verifyPlanterJwt,
  findActivePlanterByAddress,
  findActivePlanterById,
  getTaxablePayouts,
  getCarbonCreditSales,
  saveTaxDocument,
} = vi.hoisted(() => ({
  verifyPlanterJwt: vi.fn(),
  findActivePlanterByAddress: vi.fn(),
  findActivePlanterById: vi.fn(),
  getTaxablePayouts: vi.fn(),
  getCarbonCreditSales: vi.fn(),
  saveTaxDocument: vi.fn(),
}));

vi.mock('@/lib/auth/jwt', () => ({ verifyPlanterJwt }));
vi.mock('@/lib/db/tax-documents', () => ({
  findActivePlanterByAddress,
  findActivePlanterById,
  getTaxablePayouts,
  getCarbonCreditSales,
  saveTaxDocument,
}));

// ── Import after mocks are registered ─────────────────────────────────────────

import { GET, POST } from '../route';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLANTER_STELLAR = 'GPLANTERSTELLARADDRESS1234567890123456789012345678901';

const PLANTER_ROW = {
  id: 42,
  full_name: 'Ada Okafor',
  stellar_address: PLANTER_STELLAR,
  country_code: 'NG',
  region: 'Kaduna',
};

// USDC payouts are 1:1 with USD, so Box 1 is 700 + 300 = 1000.
const PAYOUTS = [
  {
    kind: 'payout' as const,
    reference: 'tx1',
    occurredAt: '2024-03-15T10:00:00.000Z',
    amount: 700,
    currency: 'USDC',
    assetCode: 'USDC',
    memo: 'Tree HRV-001',
  },
];

const CARBON_SALES = [
  {
    kind: 'carbon_credit_sale' as const,
    reference: 'sale1',
    occurredAt: '2024-06-05T00:00:00.000Z',
    amount: 300,
    currency: 'USDC',
    assetCode: 'USDC',
    memo: null,
    creditsTons: 12,
    pricePerTon: 25,
    projectRef: 'PROJ-1',
    verificationStandard: 'Verra VCS',
    buyerRef: 'buyer-9',
  },
];

const SAVED_DOCUMENT = {
  id: 7,
  planter_id: 42,
  tax_year: 2024,
  form_type: '1099-NEC',
  status: 'generated',
  gross_amount: '1000.00',
  record_count: 2,
  payload: {},
  generated_by: PLANTER_STELLAR,
  generated_at: new Date('2024-12-31T00:00:00Z'),
  updated_at: new Date('2024-12-31T00:00:00Z'),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

interface RequestParams {
  year?: string;
  type?: string;
  format?: string;
  planterId?: string;
  authorization?: string;
}

/** Build a NextRequest-like object for the handlers. */
function makeRequest(params: RequestParams = {}) {
  const url = new URL('http://localhost/api/tax-forms/1099');
  if (params.year !== undefined) url.searchParams.set('year', params.year);
  if (params.type !== undefined) url.searchParams.set('type', params.type);
  if (params.format !== undefined) url.searchParams.set('format', params.format);
  if (params.planterId !== undefined) url.searchParams.set('planterId', params.planterId);

  const authorization = params.authorization ?? 'Bearer valid-token';

  return {
    nextUrl: url,
    headers: {
      get: (key: string) => (key === 'authorization' ? authorization : null),
    },
  } as Parameters<typeof GET>[0];
}

/** Build a NextRequest-like object with a JSON body for POST. */
function makePostRequest(body: unknown, authorization = 'Bearer valid-token') {
  return {
    nextUrl: new URL('http://localhost/api/tax-forms/1099'),
    headers: {
      get: (key: string) => (key === 'authorization' ? authorization : null),
    },
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyPlanterJwt.mockResolvedValue({ sub: PLANTER_STELLAR, role: 'planter' });
  findActivePlanterByAddress.mockResolvedValue(PLANTER_ROW);
  findActivePlanterById.mockResolvedValue(PLANTER_ROW);
  getTaxablePayouts.mockResolvedValue(PAYOUTS);
  getCarbonCreditSales.mockResolvedValue(CARBON_SALES);
  saveTaxDocument.mockResolvedValue(SAVED_DOCUMENT);
});

// ── GET: input validation ─────────────────────────────────────────────────────

describe('GET /api/tax-forms/1099 — validation', () => {
  it('returns 400 when year is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/year/i);
  });

  it('returns 400 for a non 4-digit year', async () => {
    expect((await GET(makeRequest({ year: '24' }))).status).toBe(400);
  });

  it('returns 400 for a year outside the valid range', async () => {
    expect((await GET(makeRequest({ year: '2200' }))).status).toBe(400);
  });

  it('returns 400 for an unknown document type', async () => {
    const res = await GET(makeRequest({ year: '2024', type: 'w-2' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/type/i);
  });

  it('returns 400 for an unknown format', async () => {
    const res = await GET(makeRequest({ year: '2024', format: 'pdf' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/format/i);
  });

  it('returns 400 when csv is requested for every document type', async () => {
    const res = await GET(makeRequest({ year: '2024', format: 'csv', type: 'all' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/single type/i);
  });

  it('returns 400 for a non-numeric planterId', async () => {
    const res = await GET(makeRequest({ year: '2024', planterId: 'abc' }));
    expect(res.status).toBe(400);
  });
});

// ── GET: authentication & authorisation ───────────────────────────────────────

describe('GET /api/tax-forms/1099 — auth', () => {
  it('returns 401 without an Authorization header', async () => {
    const res = await GET(makeRequest({ year: '2024', authorization: '' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    verifyPlanterJwt.mockResolvedValue(null);
    expect((await GET(makeRequest({ year: '2024' }))).status).toBe(401);
  });

  it('returns 403 when a planter requests another planter via planterId', async () => {
    const res = await GET(makeRequest({ year: '2024', planterId: '99' }));
    expect(res.status).toBe(403);
    expect(findActivePlanterById).not.toHaveBeenCalled();
  });

  it('lets an admin generate for another planter', async () => {
    verifyPlanterJwt.mockResolvedValue({ sub: 'GADMIN', role: 'admin' });
    const res = await GET(makeRequest({ year: '2024', planterId: '99' }));

    expect(res.status).toBe(200);
    expect(findActivePlanterById).toHaveBeenCalledWith(99);
  });

  it('returns 404 when the planter record is missing', async () => {
    findActivePlanterByAddress.mockResolvedValue(null);
    expect((await GET(makeRequest({ year: '2024' }))).status).toBe(404);
  });
});

// ── GET: documents ────────────────────────────────────────────────────────────

describe('GET /api/tax-forms/1099 — documents', () => {
  it('returns the three documents as JSON for the authenticated planter', async () => {
    const res = await GET(makeRequest({ year: '2024' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');

    const body = await res.json();
    expect(findActivePlanterByAddress).toHaveBeenCalledWith(PLANTER_STELLAR);
    expect(body.planterId).toBe(42);
    expect(body.taxYear).toBe(2024);
    expect(Object.keys(body.documents)).toEqual([
      '1099-NEC',
      'income-summary',
      'carbon-credit-sales',
    ]);
    expect(body.documents['1099-NEC'].box1NonemployeeCompensation).toBe(1000);
    expect(body.documents['1099-NEC'].requiresFiling).toBe(true);
    expect(body.documents['income-summary'].months).toHaveLength(12);
    expect(body.documents['carbon-credit-sales'].totalCreditsTons).toBe(12);
  });

  it('filters to a single document type', async () => {
    const res = await GET(makeRequest({ year: '2024', type: 'income-summary' }));
    const body = await res.json();

    expect(Object.keys(body.documents)).toEqual(['income-summary']);
    expect(body.requestedType).toBe('income-summary');
  });

  it('returns a CSV attachment for a single type', async () => {
    const res = await GET(makeRequest({ year: '2024', type: '1099-NEC', format: 'csv' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="tax-1099-NEC-planter-42-2024.csv"'
    );
    expect(res.headers.get('x-record-count')).toBe('2');

    const csv = await res.text();
    expect(csv).toContain('box1_nonemployee_compensation_usd,1000.00');
  });

  it('returns 500 when the income query fails', async () => {
    getTaxablePayouts.mockRejectedValue(new Error('connection refused'));
    expect((await GET(makeRequest({ year: '2024' }))).status).toBe(500);
  });
});

// ── POST: generation & persistence ────────────────────────────────────────────

describe('POST /api/tax-forms/1099', () => {
  it('persists the three documents and returns them', async () => {
    const res = await POST(makePostRequest({ year: 2024 }));

    expect(res.status).toBe(201);
    expect(saveTaxDocument).toHaveBeenCalledTimes(3);
    expect(saveTaxDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        planterId: 42,
        taxYear: 2024,
        formType: '1099-NEC',
        grossAmount: 1000,
        recordCount: 2,
        generatedBy: PLANTER_STELLAR,
      })
    );

    const body = await res.json();
    expect(body.saved).toHaveLength(3);
    expect(body.saved[0]).toMatchObject({ id: 7, formType: '1099-NEC', grossAmount: 1000 });
  });

  it('persists only the requested type', async () => {
    const res = await POST(makePostRequest({ year: 2024, type: 'carbon-credit-sales' }));

    expect(res.status).toBe(201);
    expect(saveTaxDocument).toHaveBeenCalledTimes(1);
    expect(saveTaxDocument).toHaveBeenCalledWith(
      expect.objectContaining({ formType: 'carbon-credit-sales', grossAmount: 300 })
    );
  });

  it('returns 400 when year is missing from the body', async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-JSON body', async () => {
    const res = await POST({
      nextUrl: new URL('http://localhost/api/tax-forms/1099'),
      headers: { get: () => 'Bearer valid-token' },
      json: async () => {
        throw new Error('invalid json');
      },
    } as unknown as Parameters<typeof POST>[0]);

    expect(res.status).toBe(400);
  });

  it('returns 500 when persisting fails', async () => {
    saveTaxDocument.mockRejectedValue(new Error('deadlock'));
    expect((await POST(makePostRequest({ year: 2024 }))).status).toBe(500);
  });
});
