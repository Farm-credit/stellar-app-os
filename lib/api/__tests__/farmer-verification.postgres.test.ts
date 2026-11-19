import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { getFarmerVerification, verifyFarmers } from '@/lib/api/farmer-verification';

// Opt-in SQL regression tests. Only a connection-local temporary table is used.
const connectionString = process.env.FARMER_VERIFICATION_TEST_DATABASE_URL;
const FARMER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

describe.skipIf(!connectionString)(
  'farmer verification application precedence (PostgreSQL)',
  () => {
    let db: Pool;

    beforeAll(async () => {
      db = new Pool({ connectionString, max: 1 });
      await db.query(`CREATE TEMP TABLE farmer_kyc_applications (
      id UUID PRIMARY KEY,
      farmer_address TEXT NOT NULL,
      identity_verified_at TIMESTAMPTZ,
      document_type TEXT,
      ownership_type TEXT,
      plot_size_hectares NUMERIC,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      region TEXT,
      land_verified_at TIMESTAMPTZ,
      consent_granted BOOLEAN NOT NULL,
      status TEXT NOT NULL,
      screening JSONB,
      active_sanctions TEXT[] NOT NULL DEFAULT '{}',
      submitted_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )`);
    });

    afterAll(async () => {
      await db?.end();
    });

    beforeEach(async () => {
      await db.query('TRUNCATE pg_temp.farmer_kyc_applications');
      await db.query(
        `INSERT INTO farmer_kyc_applications
       (id, farmer_address, consent_granted, status, screening, submitted_at, updated_at)
       VALUES ('00000000-0000-0000-0000-000000000001', $1, true, 'approved', $2,
               '2026-07-01', '2026-07-02')`,
        [
          FARMER,
          { eligible: true, tier: 'full', blockers: [], advisories: [], rulesetVersion: 'v1' },
        ]
      );
    });

    async function addLatest(status: string, consent: boolean, sanctions: string[] = []) {
      await db.query(
        `INSERT INTO farmer_kyc_applications
       (id, farmer_address, consent_granted, status, screening, active_sanctions,
        submitted_at, updated_at)
       VALUES ('00000000-0000-0000-0000-000000000002', $1, $2, $3, $4, $5,
               '2026-08-01', '2026-08-02')`,
        [
          FARMER,
          consent,
          status,
          { eligible: true, tier: 'full', blockers: [], advisories: [], rulesetVersion: 'v1' },
          sanctions,
        ]
      );
    }

    it('does not reuse old consent when the newest application withholds it', async () => {
      await addLatest('submitted', false);
      expect(await getFarmerVerification(db, FARMER, 'v1')).toEqual({
        ok: false,
        reason: 'consent_denied',
      });
      const batch = await verifyFarmers(db, [FARMER], 'v1');
      expect(batch.reports).toEqual([]);
      expect(batch.consentDenied).toEqual([FARMER]);
    });

    it.each(['rejected', 'expired'])(
      'does not reuse old approval after a newer %s case',
      async (status) => {
        await addLatest(status, true);
        const single = await getFarmerVerification(db, FARMER, 'v1');
        const batch = await verifyFarmers(db, [FARMER], 'v1');
        expect(single.ok && single.report).toMatchObject({
          verified: false,
          verificationStatus: status,
          credit: { available: false },
        });
        expect(batch.reports[0]).toMatchObject({
          verified: false,
          verificationStatus: status,
          credit: { available: false },
        });
      }
    );

    it('uses the current sanctions rather than those of the old approval', async () => {
      await addLatest('under_review', true, ['active-sanction']);
      const single = await getFarmerVerification(db, FARMER, 'v1');
      const batch = await verifyFarmers(db, [FARMER], 'v1');
      expect(single.ok && single.report.credit).toMatchObject({
        available: false,
        sanctionsClear: false,
      });
      expect(batch.reports[0].credit).toMatchObject({ available: false, sanctionsClear: false });
    });

    it('breaks equal submission and update timestamps deterministically', async () => {
      await addLatest('rejected', true);
      await db.query(
        "UPDATE farmer_kyc_applications SET submitted_at = '2026-07-01', updated_at = '2026-07-02'"
      );
      const single = await getFarmerVerification(db, FARMER, 'v1');
      const batch = await verifyFarmers(db, [FARMER], 'v1');
      expect(single.ok && single.report.verificationStatus).toBe('rejected');
      expect(batch.reports[0].verificationStatus).toBe('rejected');
    });
  }
);
