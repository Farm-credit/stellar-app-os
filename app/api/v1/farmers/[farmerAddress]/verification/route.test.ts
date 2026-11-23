import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

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
const BASE_URL = 'http://localhost:3000/api/v1/farmers';

function verificationRow(overrides: Record<string, unknown> = {}) {
  return {
    farmer_address: FARMER,
    identity_verified_at: new Date('2026-07-01T10:00:00.000Z'),
    document_type: 'nin',
    ownership_type: 'customary',
    plot_size_hectares: '3.5',
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
    headers: { 'x-api-key': 'fc_partner_key' },
  });
}

describe('GET /api/v1/farmers/{farmerAddress}/verification', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.authenticate.mockReset();
    mocks.authenticate.mockResolvedValue({
      ok: true,
      client: { id: 1, name: 'Partner Bank', prefix: 'fc_partner', tier: 'partner' },
    });
  });

  it('returns full verification verdict for verified farmer with identity, land, and credit assertions', async () => {
    mocks.query.mockResolvedValue({ rows: [verificationRow()] });

    const response = await GET(getRequest() as never, {
      params: Promise.resolve({ farmerAddress: FARMER }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Version')).toBe('v1');
    expect(response.headers.get('X-API-Tier')).toBe('partner');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(body).toMatchObject({
      farmerAddress: FARMER,
      apiVersion: 'v1',
      verificationStatus: 'verified',
      verified: true,
      identity: {
        verified: true,
        documentType: 'nin',
        verifiedAt: '2026-07-01T10:00:00.000Z',
      },
      land: {
        verified: true,
        ownershipType: 'customary',
        plotSizeHectares: 3.5,
        region: 'Kano',
        gpsCoordinates: { latitude: 11.98, longitude: 8.55 },
      },
      credit: {
        available: true,
        tier: 'full',
        applicationSettled: false,
        sanctionsClear: true,
      },
      consent: { granted: true },
    });
    // Ensure privacy boundary: no raw national id or personal identity details exposed
    expect(body).not.toHaveProperty('nationalId');
    expect(body).not.toHaveProperty('nin');
    expect(body).not.toHaveProperty('name');
  });

  it('returns 400 when farmerAddress is not a valid Stellar public key', async () => {
    const response = await GET(getRequest('INVALID_KEY') as never, {
      params: Promise.resolve({ farmerAddress: 'INVALID_KEY' }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ code: 'invalid_address' });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('returns 401 when authentication fails', async () => {
    mocks.authenticate.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'Invalid or missing API key.',
    });

    const response = await GET(getRequest() as never, {
      params: Promise.resolve({ farmerAddress: FARMER }),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('Invalid or missing API key');
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('returns 503 when authentication service is unavailable', async () => {
    mocks.authenticate.mockRejectedValue(new Error('Auth connection timeout'));

    const response = await GET(getRequest() as never, {
      params: Promise.resolve({ farmerAddress: FARMER }),
    });

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain('Authentication is temporarily unavailable');
  });

  it('returns 403 when farmer has denied third-party verification consent', async () => {
    mocks.query.mockResolvedValue({
      rows: [verificationRow({ consent_granted: false })],
    });

    const response = await GET(getRequest() as never, {
      params: Promise.resolve({ farmerAddress: FARMER }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({
      code: 'consent_denied',
      error: 'The farmer has not granted consent for third-party verification.',
    });
  });

  it('returns 404 when farmer verification record is not found', async () => {
    mocks.query.mockResolvedValue({ rows: [] });

    const response = await GET(getRequest() as never, {
      params: Promise.resolve({ farmerAddress: FARMER }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({
      code: 'not_found',
      error: 'No verification record found for this farmer.',
    });
  });

  it('correctly marks credit unavailable when active sanctions exist', async () => {
    mocks.query.mockResolvedValue({
      rows: [
        verificationRow({
          active_sanctions: ['PEP-001'],
        }),
      ],
    });

    const response = await GET(getRequest() as never, {
      params: Promise.resolve({ farmerAddress: FARMER }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.credit.available).toBe(false);
    expect(body.credit.sanctionsClear).toBe(false);
  });
});
