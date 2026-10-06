import { describe, it, expect } from 'vitest';
import {
  KYC_RULESET_VERSION,
  KYC_THRESHOLDS,
  ageInYears,
  screenCertificationEligibility,
} from '@/lib/kyc/eligibility';
import type { KycApplicationInput } from '@/lib/kyc/types';

/**
 * Certification eligibility screening (Farm-credit/stellar-app-os#1397).
 *
 * The screen is pure, so these run without a database or a network. Each case
 * starts from a fully certifiable farmer and removes exactly one piece of
 * evidence, which keeps the failure attributable to the gate under test.
 */

const NOW = new Date('2026-09-26T12:00:00Z');

function certifiableFarmer(
  overrides: Partial<KycApplicationInput> = {}
): KycApplicationInput {
  return {
    farmerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    identity: {
      fullName: 'Amina Yusuf',
      nationalId: '12345678901',
      phoneNumber: '+2348012345678',
      village: 'Dawakin Kudu',
      dateOfBirth: '1990-04-12',
      documentType: 'nin',
      documentReference: 'NIN-SLIP-0091',
      verifiedAt: '2026-09-20T09:00:00Z',
    },
    land: {
      ownershipType: 'customary',
      plotSizeHectares: 2.5,
      gpsCoordinates: { latitude: 11.98, longitude: 8.55 },
      region: 'Kano',
      verifiedAt: '2026-09-21T09:00:00Z',
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
    ...overrides,
  };
}

const failed = (input: KycApplicationInput) =>
  screenCertificationEligibility(input, NOW).blockers;

describe('ageInYears', () => {
  it('counts whole years, flooring a birthday not yet reached', () => {
    expect(ageInYears('1990-04-12', new Date('2026-04-12T00:00:00Z'))).toBe(36);
    // Day before the birthday: still 35.
    expect(ageInYears('1990-04-12', new Date('2026-04-11T00:00:00Z'))).toBe(35);
  });

  it('returns NaN for an unparseable date rather than guessing an age', () => {
    expect(ageInYears('not-a-date', NOW)).toBeNaN();
  });
});

describe('screenCertificationEligibility - fully evidenced farmer', () => {
  it('is eligible at the full tier with no blockers or advisories', () => {
    const result = screenCertificationEligibility(certifiableFarmer(), NOW);

    expect(result.eligible).toBe(true);
    expect(result.tier).toBe('full');
    expect(result.blockers).toEqual([]);
    expect(result.advisories).toEqual([]);
    expect(result.rulesetVersion).toBe(KYC_RULESET_VERSION);
    expect(result.screenedAt).toBe(NOW.toISOString());
  });

  it('evaluates every gate exactly once', () => {
    const { checks } = screenCertificationEligibility(certifiableFarmer(), NOW);
    const names = checks.map((c) => c.requirement);

    expect(new Set(names).size).toBe(names.length);
    expect(checks.every((c) => typeof c.detail === 'string' && c.detail.length > 0)).toBe(
      true
    );
  });
});

describe('screenCertificationEligibility - blocking gates', () => {
  it('blocks a farmer who has not consented', () => {
    expect(failed(certifiableFarmer({ consentGranted: false }))).toContain(
      'consent_on_record'
    );
  });

  it('blocks an incomplete identity record', () => {
    const input = certifiableFarmer();
    input.identity = { ...input.identity, phoneNumber: '' };

    expect(failed(input)).toContain('identity_documents_complete');
  });

  it('blocks an identity document that no verifier has checked', () => {
    const input = certifiableFarmer();
    input.identity = { ...input.identity, verifiedAt: undefined };

    expect(failed(input)).toContain('identity_verified');
  });

  it('blocks a farmer below the minimum age', () => {
    const input = certifiableFarmer();
    // Turns 17 shortly before NOW.
    input.identity = { ...input.identity, dateOfBirth: '2009-09-01' };

    expect(failed(input)).toContain('minimum_age');
  });

  it('allows a farmer who is exactly the minimum age', () => {
    const input = certifiableFarmer();
    const dob = new Date(NOW);
    dob.setUTCFullYear(dob.getUTCFullYear() - KYC_THRESHOLDS.minimumAgeYears);
    input.identity = { ...input.identity, dateOfBirth: dob.toISOString().slice(0, 10) };

    expect(failed(input)).not.toContain('minimum_age');
  });

  it('blocks documentary tenure with no document reference', () => {
    const input = certifiableFarmer();
    input.land = { ...input.land, ownershipType: 'title_deed', documentReference: undefined };

    expect(failed(input)).toContain('land_proof_present');
  });

  it('accepts informal tenure without a document reference', () => {
    const input = certifiableFarmer();
    input.land = {
      ...input.land,
      ownershipType: 'family_inheritance',
      documentReference: undefined,
    };

    expect(failed(input)).not.toContain('land_proof_present');
  });

  it('blocks an unverified land claim even when a document was supplied', () => {
    const input = certifiableFarmer();
    input.land = { ...input.land, verifiedAt: undefined };

    expect(failed(input)).toContain('land_proof_verified');
  });

  it('blocks a plot below the minimum area', () => {
    const input = certifiableFarmer();
    input.land = { ...input.land, plotSizeHectares: 0.05 };

    expect(failed(input)).toContain('land_area_minimum');
  });

  it('blocks a plot outside the supported region', () => {
    const input = certifiableFarmer();
    // Nairobi — a plausible plot location, but not in the operating region.
    input.land = { ...input.land, gpsCoordinates: { latitude: -1.29, longitude: 36.82 } };

    expect(failed(input)).toContain('land_location_supported');
  });

  it('blocks non-numeric coordinates', () => {
    const input = certifiableFarmer();
    input.land = {
      ...input.land,
      gpsCoordinates: { latitude: Number.NaN, longitude: 8.55 },
    };

    expect(failed(input)).toContain('land_location_supported');
  });

  it('blocks a farmer with no agricultural experience', () => {
    const input = certifiableFarmer();
    input.experience = { ...input.experience, yearsOfExperience: 0 };

    expect(failed(input)).toContain('agricultural_experience_minimum');
  });

  it('blocks a sanctioned farmer', () => {
    const input = certifiableFarmer();
    input.certification = { ...input.certification, activeSanctions: ['Debarment 2025'] };

    expect(failed(input)).toContain('no_active_sanctions');
  });

  it('blocks a farmer missing required jurisdiction flags', () => {
    const input = certifiableFarmer();
    input.certification = {
      jurisdictionFlags: 0b100,
      requiredJurisdictionFlags: 0b101,
    };

    expect(failed(input)).toContain('jurisdiction_eligible');
  });

  it('permits a farmer holding more flags than required', () => {
    const input = certifiableFarmer();
    input.certification = {
      jurisdictionFlags: 0b1111,
      requiredJurisdictionFlags: 0b101,
    };

    expect(failed(input)).not.toContain('jurisdiction_eligible');
  });
});

describe('screenCertificationEligibility - advisory gates and tiers', () => {
  it('downgrades to provisional when training is missing but stays eligible', () => {
    const input = certifiableFarmer();
    input.experience = { ...input.experience, trainingProgrammes: [] };

    const result = screenCertificationEligibility(input, NOW);

    expect(result.eligible).toBe(true);
    expect(result.tier).toBe('provisional');
    expect(result.advisories).toEqual(['agricultural_training_record']);
    expect(result.blockers).toEqual([]);
  });

  it('downgrades to provisional when the farmer grows only one crop', () => {
    const input = certifiableFarmer();
    input.experience = { ...input.experience, secondaryCrops: [] };

    const result = screenCertificationEligibility(input, NOW);

    expect(result.tier).toBe('provisional');
    expect(result.advisories).toEqual(['multi_crop_diversification']);
  });

  it('reports no tier when a blocking gate fails, even if advisories pass', () => {
    const input = certifiableFarmer();
    input.consentGranted = false;

    const result = screenCertificationEligibility(input, NOW);

    expect(result.eligible).toBe(false);
    expect(result.tier).toBe('none');
    expect(result.blockers).toEqual(['consent_on_record']);
  });
});

describe('screenCertificationEligibility - determinism', () => {
  it('produces an identical verdict for the same input and clock', () => {
    const input = certifiableFarmer();
    const first = screenCertificationEligibility(input, NOW);
    const second = screenCertificationEligibility(input, NOW);

    expect(second).toEqual(first);
  });

  it('does not mutate the application it screens', () => {
    const input = certifiableFarmer();
    const snapshot = structuredClone(input);

    screenCertificationEligibility(input, NOW);

    expect(input).toEqual(snapshot);
  });

  it('records every failed blocking gate, not just the first', () => {
    const input = certifiableFarmer({ consentGranted: false });
    input.identity = { ...input.identity, verifiedAt: undefined };
    input.land = { ...input.land, verifiedAt: undefined };

    const result = screenCertificationEligibility(input, NOW);

    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'consent_on_record',
        'identity_verified',
        'land_proof_verified',
      ])
    );
    expect(result.blockers).toHaveLength(3);
  });
});
