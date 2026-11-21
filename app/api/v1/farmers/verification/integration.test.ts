import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { hashKey } from '@/lib/api/apiKeys';
import { GET } from '../[farmerAddress]/verification/route';
import { POST } from './route';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query }) }));

const FARMER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const KEY = 'fc_partner_secret';
const KEY_ROW = { id: 1, name: 'Partner', prefix: 'fc_partner', tier: 'standard' };
const credentialHeaders: Record<string, string>[] = [
  { 'x-api-key': KEY },
  { Authorization: `ApiKey ${KEY}` },
];
const VERIFICATION_ROW = {
  farmer_address: FARMER,
  status: 'approved',
  consent_granted: true,
  identity_verified_at: '2026-07-01T10:00:00Z',
  land_verified_at: '2026-07-02T10:00:00Z',
  document_type: 'nin',
  ownership_type: 'title_deed',
  plot_size_hectares: '3.5',
  latitude: 11.98,
  longitude: 8.55,
  region: 'Kano',
  active_sanctions: [],
  screening: {
    eligible: true,
    tier: 'full',
    checks: [{ detail: 'private reviewer notes' }],
    blockers: [],
    advisories: [],
    rulesetVersion: 'kyc-eligibility-v1',
  },
  submitted_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-02T00:00:00Z',
  full_name: 'Private Farmer Name',
  national_id_hash: 'private-identity-hash',
  document_reference_hash: 'private-land-hash',
};

const endpoints = [
  {
    name: 'single',
    invoke(headers: Record<string, string>) {
      return GET(
        new Request(`https://example.test/api/v1/farmers/${FARMER}/verification`, {
          headers,
        }) as NextRequest,
        { params: Promise.resolve({ farmerAddress: FARMER }) }
      );
    },
  },
  {
    name: 'batch',
    invoke(headers: Record<string, string>) {
      return POST(
        new Request('https://example.test/api/v1/farmers/verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ addresses: [FARMER, ` ${FARMER} `] }),
        }) as NextRequest
      );
    },
  },
];

beforeEach(() => {
  query.mockReset();
});

describe.each(endpoints)(
  'v1 $name verification with database-backed authentication',
  ({ invoke }) => {
    it.each(credentialHeaders)(
      'authenticates supported credentials and returns only consented assertions: %j',
      async (headers) => {
        query.mockResolvedValueOnce({ rows: [KEY_ROW] });
        query.mockResolvedValueOnce({ rows: [VERIFICATION_ROW] });

        const response = await invoke(headers);
        const body = await response.json();
        const report = body.reports ? body.reports[0] : body;

        expect(response.status).toBe(200);
        expect(response.headers.get('X-API-Version')).toBe('v1');
        expect(response.headers.get('X-API-Tier')).toBe('standard');
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(report).toMatchObject({
          farmerAddress: FARMER,
          verified: true,
          identity: { verified: true },
          land: { verified: true, ownershipType: 'title_deed' },
          credit: { available: true, tier: 'full' },
        });
        if (body.reports) expect(body.requested).toBe(1);
        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[0][0]).toContain('is_active = TRUE AND revoked_at IS NULL');
        expect(query.mock.calls[0][1]).toEqual([hashKey(KEY)]);
        expect(JSON.stringify(body)).not.toMatch(/Private Farmer|private-|fc_partner_secret/);
      }
    );

    it('rejects missing credentials before accessing the database', async () => {
      const response = await invoke({});
      expect(response.status).toBe(401);
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects revoked or unknown credentials before looking up a farmer', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      const response = await invoke({ 'x-api-key': KEY });
      expect(response.status).toBe(401);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('does not disclose withheld data', async () => {
      query.mockResolvedValueOnce({ rows: [KEY_ROW] });
      query.mockResolvedValueOnce({ rows: [{ ...VERIFICATION_ROW, consent_granted: false }] });
      const response = await invoke({ 'x-api-key': KEY });
      const body = await response.json();
      if (body.reports) {
        expect(response.status).toBe(200);
        expect(body.reports).toEqual([]);
        expect(body.consentDenied).toEqual([FARMER]);
      } else {
        expect(response.status).toBe(403);
        expect(body.code).toBe('consent_denied');
      }
      expect(body).not.toHaveProperty('identity');
      expect(body).not.toHaveProperty('land');
    });

    it.each(['authentication', 'verification'])(
      'fails closed during a %s store outage',
      async (store) => {
        if (store === 'verification') query.mockResolvedValueOnce({ rows: [KEY_ROW] });
        query.mockRejectedValueOnce(new Error('private database connection details'));
        const response = await invoke({ 'x-api-key': KEY });
        expect(response.status).toBe(503);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(await response.text()).not.toContain('private database');
      }
    );
  }
);
