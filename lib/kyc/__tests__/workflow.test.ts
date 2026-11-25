import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screenCertificationEligibility } from '@/lib/kyc/eligibility';
import { KycService, type KycDb } from '@/lib/kyc/service';
import type { KycApplicationRecord } from '@/lib/kyc/types';
import {
  canTransitionKycStatus,
  evaluateKycWorkflow,
  hasOnlyVerifierPendingBlockers,
} from '@/lib/kyc/workflow';

const VALID_SUBMISSION = {
  farmerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  identity: {
    fullName: 'Amina Yusuf',
    nationalId: '12345678901',
    phoneNumber: '+2348012345678',
    village: 'Dawakin Kudu',
    dateOfBirth: '1990-04-12',
    documentType: 'nin',
    documentReference: 'NIN-SLIP-0091',
  },
  land: {
    ownershipType: 'title_deed',
    documentReference: 'DEED-KANO-4421',
    plotSizeHectares: 2.5,
    gpsCoordinates: { latitude: 11.98, longitude: 8.55 },
    region: 'Kano',
  },
  experience: {
    yearsOfExperience: 6,
    primaryCrop: 'Maize',
    secondaryCrops: ['Cowpea', 'Sorghum'],
    soilType: 'loamy',
    trainingProgrammes: ['FMARD Good Agronomy 2024'],
  },
  certification: {
    jurisdictionFlags: 0b111,
    requiredJurisdictionFlags: 0b101,
    activeSanctions: [],
  },
  consentGranted: true,
};

function createInMemoryKycDb() {
  const rows = new Map<string, Record<string, unknown>>();
  let seq = 1;

  const query = vi.fn((sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.includes('WHERE national_id_hash = $1')) {
      const hash = params[0];
      const found = Array.from(rows.values()).filter(
        (r) =>
          r.national_id_hash === hash &&
          ['submitted', 'under_review', 'approved'].includes(String(r.status))
      );
      return Promise.resolve({ rows: found.slice(0, 1) });
    }

    if (normalized.startsWith('INSERT INTO farmer_kyc_applications')) {
      const id = `kyc-app-${seq++}`;
      const now = new Date().toISOString();
      const row: Record<string, unknown> = {
        id,
        farmer_address: params[0],
        full_name: params[1],
        national_id_hash: params[2],
        phone_number: params[3],
        village: params[4],
        date_of_birth: params[5],
        document_type: params[6],
        document_reference_hash: params[7],
        identity_verified_at: null,
        ownership_type: params[8],
        plot_size_hectares: params[9],
        latitude: params[10],
        longitude: params[11],
        region: params[12],
        land_verified_at: null,
        years_of_experience: params[13],
        primary_crop: params[14],
        secondary_crops: params[15],
        soil_type: params[16],
        training_programmes: params[17],
        jurisdiction_flags: params[18],
        required_jurisdiction_flags: params[19],
        active_sanctions: params[20],
        consent_granted: params[21],
        status: params[22],
        screening: JSON.parse(String(params[23])),
        decision: null,
        submitted_at: now,
        updated_at: now,
      };
      rows.set(id, row);
      return Promise.resolve({ rows: [row] });
    }

    if (normalized.includes('FROM farmer_kyc_applications WHERE id = $1')) {
      const row = rows.get(String(params[0]));
      return Promise.resolve({ rows: row ? [row] : [] });
    }

    if (normalized.includes('SET identity_verified_at = CASE')) {
      const row = rows.get(String(params[0]));
      if (row) {
        if (params[1]) row.identity_verified_at = params[3];
        if (params[2]) row.land_verified_at = params[3];
        if (row.status === 'submitted') row.status = 'under_review';
        row.updated_at = new Date().toISOString();
      }
      return Promise.resolve({ rows: row ? [row] : [] });
    }

    if (normalized.includes('SET screening = $2::jsonb')) {
      const row = rows.get(String(params[0]));
      if (row) {
        row.screening = JSON.parse(String(params[1]));
        row.updated_at = new Date().toISOString();
      }
      return Promise.resolve({ rows: row ? [row] : [] });
    }

    if (normalized.includes("SET status = 'under_review'")) {
      const row = rows.get(String(params[0]));
      if (row) {
        row.status = 'under_review';
        row.updated_at = new Date().toISOString();
      }
      return Promise.resolve({ rows: row ? [row] : [] });
    }

    if (normalized.includes("SET status = 'expired'")) {
      const row = rows.get(String(params[0]));
      if (row) {
        row.status = 'expired';
        if (params[1]) row.decision = JSON.parse(String(params[1]));
        row.updated_at = new Date().toISOString();
      }
      return Promise.resolve({ rows: row ? [row] : [] });
    }

    if (normalized.includes('SET status = $2, decision = $3::jsonb')) {
      const row = rows.get(String(params[0]));
      if (row) {
        row.status = params[1];
        row.decision = JSON.parse(String(params[2]));
        row.updated_at = new Date().toISOString();
      }
      return Promise.resolve({ rows: row ? [row] : [] });
    }

    return Promise.resolve({ rows: [] });
  });

  return { db: { query } as unknown as KycDb, rows };
}

describe('Farmer KYC verification workflow', () => {
  describe('state transitions and pre-verification checks', () => {
    it('enforces valid KYC status transitions', () => {
      expect(canTransitionKycStatus('submitted', 'under_review')).toBe(true);
      expect(canTransitionKycStatus('under_review', 'approved')).toBe(true);
      expect(canTransitionKycStatus('approved', 'expired')).toBe(true);
      expect(canTransitionKycStatus('rejected', 'approved')).toBe(false);
      expect(canTransitionKycStatus('expired', 'under_review')).toBe(false);
    });

    it('identifies applications that only await verifier sign-off', () => {
      const screening = screenCertificationEligibility(VALID_SUBMISSION);
      expect(screening.eligible).toBe(false);
      expect(screening.blockers).toEqual(['identity_verified', 'land_proof_verified']);
      expect(hasOnlyVerifierPendingBlockers(screening)).toBe(true);

      const sanctioned = screenCertificationEligibility({
        ...VALID_SUBMISSION,
        certification: {
          ...VALID_SUBMISSION.certification,
          activeSanctions: ['OFAC-MATCH'],
        },
      });
      expect(hasOnlyVerifierPendingBlockers(sanctioned)).toBe(false);
    });
  });

  describe('KycService end-to-end verification pipeline', () => {
    const previousSalt = process.env.KYC_IDENTITY_SALT;

    beforeEach(() => {
      process.env.KYC_IDENTITY_SALT = 'test-kyc-identity-salt';
    });

    afterEach(() => {
      if (previousSalt === undefined) {
        delete process.env.KYC_IDENTITY_SALT;
      } else {
        process.env.KYC_IDENTITY_SALT = previousSalt;
      }
    });

    it('submits into queue, blocks duplicates, verifies identity & land, and approves', async () => {
      const { db } = createInMemoryKycDb();
      const service = new KycService(db);

      // 1. Farmer submits application -> enters queue as `submitted` (not prematurely rejected)
      const submitted = await service.submitApplication(VALID_SUBMISSION);
      expect(submitted.ok).toBe(true);
      expect(submitted.application?.status).toBe('submitted');

      const appId = submitted.application!.id;

      // 2. Duplicate national ID submission is blocked while active
      const duplicate = await service.submitApplication(VALID_SUBMISSION);
      expect(duplicate.ok).toBe(false);
      expect(duplicate.errors?.[0]?.field).toBe('identity.nationalId');

      // 3. Initial 4-stage workflow shows identity & land pending verification
      const initialWorkflow = await service.getWorkflowSummary(appId);
      expect(initialWorkflow?.workflow.completedStages).toBe(2);
      expect(initialWorkflow?.workflow.readyForApproval).toBe(false);
      expect(initialWorkflow?.workflow.stages[0].status).toBe('pending_verification');
      expect(initialWorkflow?.workflow.stages[1].status).toBe('pending_verification');
      expect(initialWorkflow?.workflow.stages[2].status).toBe('passed');
      expect(initialWorkflow?.workflow.stages[3].status).toBe('passed');

      // 4. Reviewer starts review -> `under_review`
      const started = await service.startReview(appId);
      expect(started.ok).toBe(true);
      expect(started.application?.status).toBe('under_review');

      // 5. Verifier signs off on identity and land proof -> re-screened as eligible (full tier)
      const verified = await service.recordVerification(appId, {
        identityVerified: true,
        landVerified: true,
      });
      expect(verified.ok).toBe(true);
      expect(verified.application?.screening.eligible).toBe(true);
      expect(verified.application?.screening.tier).toBe('full');

      const verifiedWorkflow = await service.getWorkflowSummary(appId);
      expect(verifiedWorkflow?.workflow.completedStages).toBe(4);
      expect(verifiedWorkflow?.workflow.progressPercent).toBe(100);
      expect(verifiedWorkflow?.workflow.readyForApproval).toBe(true);

      // 6. Reviewer records final approval -> `approved` (on-chain: `verified`)
      const approved = await service.recordDecision(appId, {
        decision: 'approve',
        reviewer: 'verifier-1',
        decidedAt: new Date().toISOString(),
      });
      expect(approved.ok).toBe(true);
      expect(approved.application?.status).toBe('approved');
      expect(service.onChainStatusFor(approved.application!)).toBe('verified');

      // 7. Approved certification can later be expired
      const expired = await service.expireApplication(appId, 'Annual KYC renewal overdue');
      expect(expired.ok).toBe(true);
      expect(expired.application?.status).toBe('expired');
      expect(service.onChainStatusFor(expired.application!)).toBe('expired');
    });

    it('rejects applications upfront when a hard eligibility gate fails', async () => {
      const { db } = createInMemoryKycDb();
      const service = new KycService(db);

      const result = await service.submitApplication({
        ...VALID_SUBMISSION,
        certification: {
          ...VALID_SUBMISSION.certification,
          activeSanctions: ['UN-SANCTION'],
        },
      });

      expect(result.ok).toBe(true);
      expect(result.application?.status).toBe('rejected');

      const workflow = evaluateKycWorkflow(result.application as KycApplicationRecord);
      expect(workflow.stages[3].status).toBe('failed');
      expect(workflow.readyForApproval).toBe(false);
    });
  });
});
