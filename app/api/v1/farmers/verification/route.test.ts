import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../[farmerAddress]/verification/route';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  authenticate: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mocks.query }),
}));

vi.mock('@/lib/api/farmer-verification-auth', () => ({
  authenticateFarmerVerificationRequest: mocks.authenticate,
}));

const FARMER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const OTHER_FARMER = `G${'B'.repeat(55)}`;
const BASE_URL = 'http://localhost:3000/api/v1/farmers';

function verificationRow(overrides: Record<string, unknown> = {}) {
  return {
    farmer_address: FARMER,
    identity_verified_at: new Date('2026-07-01T10:00:00.000Z'),
    document_type: 'nin',
    ownership_type: 'customary',
    plot_size_hectares: '2.5',
    latitude: '11.98',
    longitude: '8.55',
    region: 'Kano',
    land_verified_at: new Date('2026-07-02T10:00:00.000Z'),
    consent_granted: true,
    status: 'approved',
    screening: {
      eligible: true,
      tier: 'full',
      checks: [],
      blockers: [],
      advisories: [],
      rulesetVersion: 'kyc-eligibility-v1',
      screenedAt: '2026-07-01T00:00:00.000Z',
    },
    active_sanctions: [],
    submitted_at: new Date('2026-07-01T00:00:00.000Z'),
    updated_at: new Date('2026-07-02T00:00:00.000Z'),
    ...overrides,
  };
}

function getRequest(address = FARMER): Request {
  return new Request(`${BASE_URL}/${address}/verification`, {
    headers: { 'x-api-key': 'fc_test' },
  });
}

function postRequest(body: unknown, raw = false): Request {
  return new Request(`${BASE_URL}/verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'fc_test' },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

describe('farmer verification API v1 routes', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.authenticate.mockReset();
    mocks.authenticate.mockResolvedValue({
      ok: true,
      client: { id: 1, name: 'Partner', prefix: 'fc_test', tier: 'standard' },
    });
  });

  it('returns a consented farmer report without PII', async () => {
    mocks.query.mockResolvedValue({ rows: [verificationRow()] });

    const response = await GET(getRequest() as never, {
      params: Promise.resolve({ farmerAddress: FARMER }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Version')).toBe('v1');
    expect(response.headers.get('X-API-Tier')).toBe('standard');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(body).toMatchObject({
      farmerAddress: FARMER,
      apiVersion: 'v1',
      verified: true,
      identity: { verified: true, documentType: 'nin' },
      land: { verified: true, ownershipType: 'customary' },
      credit: { available: true, tier: 'full' },
    });
    expect(JSON.stringify(body)).not.toContain('nationalId');
  });

  it('rejects malformed addresses before querying farmer data', async () => {
    const response = await GET(getRequest('invalid') as never, {
      params: Promise.resolve({ farmerAddress: 'invalid' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'invalid_address' });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('distinguishes missing records from withheld consent', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [verificationRow({ consent_granted: false })],
    });

    const missing = await GET(getRequest() as never, {
      params: Promise.resolve({ farmerAddress: FARMER }),
    });
    const denied = await GET(getRequest() as never, {
      params: Promise.resolve({ farmerAddress: FARMER }),
    });

    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ code: 'not_found' });
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({ code: 'consent_denied' });
  });

  it('verifies a portfolio in one database query', async () => {
    mocks.query.mockResolvedValue({
      rows: [
        verificationRow(),
        verificationRow({ farmer_address: OTHER_FARMER, consent_granted: false }),
      ],
    });

    const response = await POST(postRequest({ addresses: [FARMER, OTHER_FARMER] }) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Version')).toBe('v1');
    expect(body).toMatchObject({
      requested: 2,
      count: 1,
      verified: 1,
      consentDenied: [OTHER_FARMER],
      notFound: [],
    });
    expect(body.reports[0].apiVersion).toBe('v1');
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('returns validation errors for malformed batch requests', async () => {
    const invalidJson = await POST(postRequest('{broken', true) as never);
    const invalidAddress = await POST(postRequest({ addresses: [FARMER, 'bad'] }) as never);

    expect(invalidJson.status).toBe(400);
    expect(invalidAddress.status).toBe(400);
    await expect(invalidAddress.json()).resolves.toMatchObject({
      details: [expect.stringContaining('addresses[1]')],
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('does not disclose data when API-key authentication fails', async () => {
    mocks.authenticate.mockResolvedValue({ ok: false, status: 401, error: 'Invalid API key.' });

    const response = await GET(getRequest() as never, {
      params: Promise.resolve({ farmerAddress: FARMER }),
    });

    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
