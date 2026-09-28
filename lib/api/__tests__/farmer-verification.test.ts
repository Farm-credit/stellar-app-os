import { describe, it, expect, vi } from 'vitest';
import {
  MAX_BATCH_ADDRESSES,
  evaluateCredit,
  getFarmerVerification,
  isStellarAddress,
  parseVerificationAddresses,
  verifyFarmers,
  type FarmerVerificationDb,
} from '@/lib/api/farmer-verification';
import { authenticateFarmerVerificationRequest } from '@/lib/api/farmer-verification-auth';
import type { KycScreeningResult } from '@/lib/kyc/types';

/**
 * Third-party farmer verification API (Farm-credit/stellar-app-os#1403).
 *
 * The properties that matter beyond field coverage:
 *  - a report must never carry PII, only assertions about checks that passed;
 *  - disclosure requires recorded consent, and a withheld record reads as
 *    absent rather than partially redacted;
 *  - credit availability follows the stored screening verdict, sanctions, and
 *    application state rather than being recomputed.
 */

const FARMER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const OTHER_FARMER = `G${'B'.repeat(55)}`;
const THIRD_FARMER = `G${'C'.repeat(55)}`;

const SCREENING: KycScreeningResult = {
  eligible: true,
  tier: 'provisional',
  checks: [],
  blockers: [],
  advisories: ['agricultural_training_record'],
  rulesetVersion: 'kyc-eligibility-v1',
  screenedAt: '2026-08-01T00:00:00.000Z',
};

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    status: 'submitted',
    screening: SCREENING,
    active_sanctions: [],
    submitted_at: new Date('2026-07-03T10:00:00.000Z'),
    updated_at: new Date('2026-07-03T10:00:00.000Z'),
    ...overrides,
  };
}

function stubDb(rows: unknown[]): { db: FarmerVerificationDb; calls: Array<[string, unknown[]?]> } {
  const calls: Array<[string, unknown[]?]> = [];
  const db = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      return { rows };
    }),
  } as unknown as FarmerVerificationDb;
  return { db, calls };
}

describe('isStellarAddress', () => {
  it('accepts a 56-character G address and rejects everything else', () => {
    expect(isStellarAddress(FARMER)).toBe(true);
    expect(isStellarAddress(`  ${FARMER}  `)).toBe(true);
    expect(isStellarAddress('G123')).toBe(false);
    expect(isStellarAddress('')).toBe(false);
    expect(isStellarAddress(null)).toBe(false);
  });
});

describe('getFarmerVerification', () => {
  it('projects identity, land, certification, and credit without PII', async () => {
    const { db, calls } = stubDb([row()]);

    const result = await getFarmerVerification(db, FARMER);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.report;
    expect(report.farmerAddress).toBe(FARMER);
    expect(report.apiVersion).toBe('v2');
    expect(report.verificationStatus).toBe('pending');
    expect(report.verified).toBe(false);
    expect(report.identity).toEqual({
      verified: true,
      verifiedAt: '2026-07-01T10:00:00.000Z',
      documentType: 'nin',
    });
    expect(report.land).toEqual({
      verified: true,
      verifiedAt: '2026-07-02T10:00:00.000Z',
      ownershipType: 'customary',
      plotSizeHectares: 2.5,
      region: 'Kano',
      gpsCoordinates: { latitude: 11.98, longitude: 8.55 },
    });
    expect(report.certification.eligible).toBe(true);
    expect(report.credit.available).toBe(true);
    expect(report.credit.tier).toBe('provisional');
    expect(report.consent).toEqual({ granted: true });

    // The privacy boundary: no personal identifier or evidence hash leaks.
    const serialised = JSON.stringify(report);
    for (const forbidden of ['fullName', 'nationalId', 'phoneNumber', 'village', 'dateOfBirth']) {
      expect(serialised).not.toContain(forbidden);
    }
    expect(Object.keys(report.identity)).toEqual(['verified', 'verifiedAt', 'documentType']);

    // Prefers an approved application, then the newest one.
    const sql = String(calls[0][0]);
    expect(sql).toContain("status = 'approved'");
    expect(sql).toContain('ORDER BY');
    expect(calls[0][1]).toEqual([FARMER]);
  });

  it('maps approved applications to a verified report', async () => {
    const { db } = stubDb([row({ status: 'approved' })]);
    const result = await getFarmerVerification(db, FARMER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.verified).toBe(true);
    expect(result.report.verificationStatus).toBe('verified');
  });

  it('can emit the v1 contract for legacy partner integrations', async () => {
    const { db } = stubDb([row({ status: 'approved' })]);
    const result = await getFarmerVerification(db, FARMER, 'v1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.apiVersion).toBe('v1');
    expect(result.report.credit.available).toBe(true);
  });

  it('reports consent_denied instead of a redacted record', async () => {
    const { db } = stubDb([row({ consent_granted: false })]);
    const result = await getFarmerVerification(db, FARMER);
    expect(result).toEqual({ ok: false, reason: 'consent_denied' });
  });

  it('reports not_found when there is no application', async () => {
    const { db } = stubDb([]);
    const result = await getFarmerVerification(db, FARMER);
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('treats a missing screening column as ineligible rather than assumed-good', async () => {
    const { db } = stubDb([row({ screening: null })]);
    const result = await getFarmerVerification(db, FARMER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.certification.eligible).toBe(false);
    expect(result.report.certification.rulesetVersion).toBe('unavailable');
    expect(result.report.credit.available).toBe(false);
  });
});

describe('evaluateCredit', () => {
  it('grants credit from an eligible, live, sanctions-free application', () => {
    const credit = evaluateCredit('under_review', SCREENING, []);
    expect(credit).toMatchObject({
      available: true,
      tier: 'provisional',
      applicationSettled: false,
      sanctionsClear: true,
      blockers: [],
    });
  });

  it('blocks credit when sanctions are active', () => {
    const credit = evaluateCredit('submitted', SCREENING, ['OFAC']);
    expect(credit.available).toBe(false);
    expect(credit.tier).toBe('none');
    expect(credit.sanctionsClear).toBe(false);
  });

  it('blocks credit once the application is settled, keeping the failed gates visible', () => {
    const rejected: KycScreeningResult = {
      ...SCREENING,
      eligible: false,
      tier: 'none',
      blockers: ['land_proof_verified'],
    };
    const credit = evaluateCredit('rejected', rejected, []);
    expect(credit.available).toBe(false);
    expect(credit.applicationSettled).toBe(true);
    expect(credit.blockers).toEqual(['land_proof_verified']);
  });
});

describe('parseVerificationAddresses', () => {
  it('accepts and de-duplicates a batch', () => {
    const parsed = parseVerificationAddresses({ addresses: [FARMER, ` ${FARMER} `, OTHER_FARMER] });
    expect(parsed.ok).toBe(true);
    expect(parsed.addresses).toEqual([FARMER, OTHER_FARMER]);
  });

  it('rejects a non-object body and an empty list', () => {
    expect(parseVerificationAddresses(null).ok).toBe(false);
    expect(parseVerificationAddresses([]).ok).toBe(false);
    expect(parseVerificationAddresses({}).ok).toBe(false);
    expect(parseVerificationAddresses({ addresses: [] }).ok).toBe(false);
  });

  it('rejects the whole batch when any entry is malformed', () => {
    const parsed = parseVerificationAddresses({ addresses: [FARMER, 'not-an-address'] });
    expect(parsed.ok).toBe(false);
    expect(parsed.errors[0]).toContain('addresses[1]');
  });

  it('enforces the batch ceiling', () => {
    const addresses = Array.from({ length: MAX_BATCH_ADDRESSES + 1 }, () => `G${'A'.repeat(55)}`);
    const parsed = parseVerificationAddresses({ addresses });
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((e) => e.includes(String(MAX_BATCH_ADDRESSES)))).toBe(true);
  });
});

describe('verifyFarmers', () => {
  it('buckets hits, misses, and consent refusals in request order', async () => {
    const db = {
      query: vi.fn(async (_sql: string, params?: unknown[]) => {
        const address = params?.[0];
        if (address === FARMER) return { rows: [row({ status: 'approved' })] };
        if (address === OTHER_FARMER) return { rows: [row({ consent_granted: false })] };
        return { rows: [] };
      }),
    } as unknown as FarmerVerificationDb;

    const third = THIRD_FARMER;
    const batch = await verifyFarmers(db, [FARMER, OTHER_FARMER, third]);

    expect(batch.requested).toBe(3);
    expect(batch.count).toBe(1);
    expect(batch.verified).toBe(1);
    expect(batch.reports[0].farmerAddress).toBe(FARMER);
    expect(batch.consentDenied).toEqual([OTHER_FARMER]);
    expect(batch.notFound).toEqual([third]);
  });
});

describe('authenticateFarmerVerificationRequest', () => {
  const request = (key?: string): Request =>
    new Request('https://harvesta.test/api/v2/farmers/verification', {
      method: 'POST',
      headers: key ? { 'x-api-key': key } : {},
    });

  it('rejects a request without a key', async () => {
    const result = await authenticateFarmerVerificationRequest(request(), vi.fn());
    expect(result).toEqual({
      ok: false,
      status: 401,
      error: expect.stringContaining('x-api-key'),
    });
  });

  it('rejects an unknown or revoked key', async () => {
    const result = await authenticateFarmerVerificationRequest(
      request('fc_deadbeef'),
      vi.fn(async () => null)
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
  });

  it('accepts an active key and exposes only its display metadata', async () => {
    const lookup = vi.fn(async () => ({
      id: 7,
      name: 'Lagos Microfinance',
      prefix: 'fc_1a2b3c4d',
      key_hash: 'secret-hash',
      tier: 'standard' as const,
      owner_wallet: FARMER,
      is_active: true,
      created_at: new Date(),
      last_used_at: null,
      revoked_at: null,
    }));

    const result = await authenticateFarmerVerificationRequest(request('fc_live_key'), lookup);
    expect(result).toEqual({
      ok: true,
      client: { id: 7, name: 'Lagos Microfinance', prefix: 'fc_1a2b3c4d', tier: 'standard' },
    });
  });
});
