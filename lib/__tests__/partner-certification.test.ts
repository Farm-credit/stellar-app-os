import { beforeEach, describe, expect, it } from 'vitest';
import {
  PartnerCertificationError,
  evaluateStandards,
  getActiveCertification,
  isPartnerCertified,
  parseApplicationInput,
  resetPartnerCertificationsForTest,
  reviewApplication,
  submitApplication,
  type CertificationApplicationInput,
} from '../partner-certification';

const good: CertificationApplicationInput = {
  partnerId: 'partner-acme',
  organisationName: 'Acme Foundation',
  contactEmail: 'ops@acme.org',
  nativeTrees: 900,
  totalTrees: 1000,
  monitoringVisitsPerYear: 4,
  reportedSurvivalRate: 88,
  reportsPerYear: 4,
  evidenceUrl: 'https://acme.org/evidence.pdf',
  attested: true,
};

beforeEach(() => resetPartnerCertificationsForTest());

describe('evaluateStandards (#1691)', () => {
  it('passes a compliant application', () => {
    expect(evaluateStandards(good).every((c) => c.passed)).toBe(true);
  });

  it('fails each standard independently', () => {
    const failed = (patch: Partial<CertificationApplicationInput>) =>
      evaluateStandards({ ...good, ...patch })
        .filter((c) => !c.passed)
        .map((c) => c.standard);
    expect(failed({ nativeTrees: 500 })).toEqual(['species_selection']);
    expect(failed({ reportedSurvivalRate: 60 })).toEqual(['survival_monitoring']);
    expect(failed({ monitoringVisitsPerYear: 1 })).toEqual(['survival_monitoring']);
    expect(failed({ reportsPerYear: 1 })).toEqual(['reporting']);
  });
});

describe('parseApplicationInput', () => {
  it('requires the attestation and valid values', () => {
    expect(() => parseApplicationInput({ ...good, attested: false })).toThrow(
      PartnerCertificationError
    );
    expect(() => parseApplicationInput({ ...good, nativeTrees: 2000 })).toThrow(/exceed/);
    expect(() => parseApplicationInput({ ...good, contactEmail: 'nope' })).toThrow(/email/);
    expect(parseApplicationInput({ ...good }).partnerId).toBe('partner-acme');
  });
});

describe('review workflow', () => {
  it('approves a compliant application and issues a badge', () => {
    const app = submitApplication(good);
    expect(isPartnerCertified('partner-acme')).toBe(false);
    const approved = reviewApplication(app.id, 'approve', 'Looks good');
    expect(approved.status).toBe('approved');
    expect(isPartnerCertified('partner-acme')).toBe(true);
    expect(getActiveCertification('partner-acme')?.expiresAt).not.toBeNull();
  });

  it('refuses to approve an application that misses a standard', () => {
    const app = submitApplication({ ...good, reportsPerYear: 0 });
    expect(() => reviewApplication(app.id, 'approve', null)).toThrow(/standards not met/);
  });

  it('requires a note to reject and blocks double reviews', () => {
    const app = submitApplication(good);
    expect(() => reviewApplication(app.id, 'reject', '')).toThrow(/note is required/);
    reviewApplication(app.id, 'reject', 'Missing survival data');
    expect(() => reviewApplication(app.id, 'approve', null)).toThrow(/already been reviewed/);
    expect(isPartnerCertified('partner-acme')).toBe(false);
  });

  it('expires certifications', () => {
    const app = submitApplication(good, new Date('2024-01-01T00:00:00Z'));
    reviewApplication(app.id, 'approve', null, new Date('2024-01-02T00:00:00Z'));
    expect(isPartnerCertified('partner-acme', new Date('2025-01-01T00:00:00Z'))).toBe(true);
    expect(isPartnerCertified('partner-acme', new Date('2027-01-01T00:00:00Z'))).toBe(false);
  });

  it('rejects a second open application and unknown ids', () => {
    submitApplication(good);
    expect(() => submitApplication(good)).toThrow(/already under review/);
    expect(() => reviewApplication('missing', 'approve', null)).toThrow(/not found/);
  });
});
