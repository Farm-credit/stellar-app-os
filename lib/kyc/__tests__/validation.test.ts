import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hashIdentifier, validateKycSubmission } from '@/lib/kyc/validation';

/**
 * Submission validation and PII hashing (Farm-credit/stellar-app-os#1397).
 *
 * Two properties matter here beyond field coverage:
 *  - a submission must never be able to assert its own verification, and
 *  - raw identifiers must not survive into the value that gets persisted.
 */

const VALID_SALT = 'test-salt-not-a-real-secret';

function validBody(): Record<string, unknown> {
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
    },
    land: {
      ownershipType: 'customary',
      plotSizeHectares: 2.5,
      gpsCoordinates: { latitude: 11.98, longitude: 8.55 },
      region: 'Kano',
    },
    experience: {
      yearsOfExperience: 6,
      primaryCrop: 'Maize',
      secondaryCrops: ['Cowpea'],
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
}

const errorFields = (body: unknown): string[] => {
  const result = validateKycSubmission(body);
  return result.errors.map((e) => e.field);
};

describe('validateKycSubmission', () => {
  beforeEach(() => {
    process.env.KYC_IDENTITY_SALT = VALID_SALT;
  });

  afterEach(() => {
    delete process.env.KYC_IDENTITY_SALT;
  });

  it('accepts a well-formed submission and normalises whitespace', () => {
    const body = validBody();
    (body.identity as Record<string, unknown>).fullName = '  Amina Yusuf  ';

    const result = validateKycSubmission(body);

    expect(result.valid).toBe(true);
    expect(result.input?.identity.fullName).toBe('Amina Yusuf');
    expect(result.input?.experience.secondaryCrops).toEqual(['Cowpea']);
  });

  it('rejects a non-object body', () => {
    expect(validateKycSubmission(null).valid).toBe(false);
    expect(validateKycSubmission('nope').valid).toBe(false);
    expect(errorFields([])).toContain('');
  });

  it('rejects a malformed Stellar address', () => {
    const body = validBody();
    body.farmerAddress = 'not-a-stellar-key';

    expect(errorFields(body)).toContain('farmerAddress');
  });

  it('rejects a missing national id', () => {
    const body = validBody();
    (body.identity as Record<string, unknown>).nationalId = '';

    expect(errorFields(body)).toContain('identity.nationalId');
  });

  it('rejects a malformed date of birth', () => {
    const body = validBody();
    (body.identity as Record<string, unknown>).dateOfBirth = '12/04/1990';

    expect(errorFields(body)).toContain('identity.dateOfBirth');
  });

  it('rejects a date of birth in the future', () => {
    const body = validBody();
    (body.identity as Record<string, unknown>).dateOfBirth = '2099-01-01';

    expect(errorFields(body)).toContain('identity.dateOfBirth');
  });

  it('rejects an unknown identity document type', () => {
    const body = validBody();
    (body.identity as Record<string, unknown>).documentType = 'library_card';

    expect(errorFields(body)).toContain('identity.documentType');
  });

  it('requires a document reference for documentary tenure', () => {
    const body = validBody();
    (body.land as Record<string, unknown>).ownershipType = 'title_deed';
    delete (body.land as Record<string, unknown>).documentReference;

    expect(errorFields(body)).toContain('land.documentReference');
  });

  it('does not require a document reference for informal tenure', () => {
    const body = validBody();
    (body.land as Record<string, unknown>).ownershipType = 'communal';

    const result = validateKycSubmission(body);

    expect(result.valid).toBe(true);
  });

  it('rejects a non-positive plot size', () => {
    const body = validBody();
    (body.land as Record<string, unknown>).plotSizeHectares = 0;

    expect(errorFields(body)).toContain('land.plotSizeHectares');
  });

  it('rejects out-of-range coordinates but accepts an unsupported region', () => {
    const body = validBody();
    (body.land as Record<string, unknown>).gpsCoordinates = {
      latitude: 91,
      longitude: 8.55,
    };

    expect(errorFields(body)).toContain('land.gpsCoordinates.latitude');

    // Nairobi is out of region but is a *valid coordinate* — region support is
    // a screening decision, not a well-formedness one.
    const inRange = validBody();
    (inRange.land as Record<string, unknown>).gpsCoordinates = {
      latitude: -1.29,
      longitude: 36.82,
    };
    expect(validateKycSubmission(inRange).valid).toBe(true);
  });

  it('rejects negative years of experience', () => {
    const body = validBody();
    (body.experience as Record<string, unknown>).yearsOfExperience = -1;

    expect(errorFields(body)).toContain('experience.yearsOfExperience');
  });

  it('requires consent to be an explicit boolean', () => {
    const body = validBody();
    delete body.consentGranted;

    expect(errorFields(body)).toContain('consentGranted');

    const stringy = validBody();
    stringy.consentGranted = 'yes';
    expect(errorFields(stringy)).toContain('consentGranted');
  });

  it('ignores any verification timestamp supplied by the submitter', () => {
    const body = validBody();
    (body.identity as Record<string, unknown>).verifiedAt = '2020-01-01T00:00:00Z';
    (body.land as Record<string, unknown>).verifiedAt = '2020-01-01T00:00:00Z';

    const result = validateKycSubmission(body);

    // Accepting these would let a farmer self-certify past the two blocking
    // verification gates on the way through screening.
    expect(result.valid).toBe(true);
    expect(result.input?.identity.verifiedAt).toBeUndefined();
    expect(result.input?.land.verifiedAt).toBeUndefined();
  });

  it('reports every problem at once rather than the first', () => {
    const body = validBody();
    (body.identity as Record<string, unknown>).fullName = '';
    (body.identity as Record<string, unknown>).phoneNumber = '';
    (body.experience as Record<string, unknown>).primaryCrop = '';

    const fields = errorFields(body);

    expect(fields).toEqual(
      expect.arrayContaining([
        'identity.fullName',
        'identity.phoneNumber',
        'experience.primaryCrop',
      ])
    );
  });
});

describe('hashIdentifier', () => {
  beforeEach(() => {
    process.env.KYC_IDENTITY_SALT = VALID_SALT;
  });

  afterEach(() => {
    delete process.env.KYC_IDENTITY_SALT;
  });

  it('is stable, so the same identifier can be compared later', () => {
    expect(hashIdentifier('12345678901')).toBe(hashIdentifier('12345678901'));
  });

  it('separates different identifiers', () => {
    expect(hashIdentifier('12345678901')).not.toBe(hashIdentifier('12345678902'));
  });

  it('does not contain the raw identifier', () => {
    const hash = hashIdentifier('12345678901');

    expect(hash).not.toContain('12345678901');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the salt changes, so digests are not cross-deployment comparable', () => {
    const withFirstSalt = hashIdentifier('12345678901');
    process.env.KYC_IDENTITY_SALT = 'a-different-salt';

    expect(hashIdentifier('12345678901')).not.toBe(withFirstSalt);
  });

  it('refuses to hash at all without a salt', () => {
    delete process.env.KYC_IDENTITY_SALT;

    expect(() => hashIdentifier('12345678901')).toThrow(/KYC_IDENTITY_SALT/);
  });
});
