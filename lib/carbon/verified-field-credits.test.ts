import { describe, expect, it } from 'vitest';
import { calculateFieldCredit, type FieldSample } from './verified-field-credits';

const context = {
  treeId: 17,
  treeRef: 'HRV-2024-0001',
  sponsorWallet: 'GCFIELDSPONSOR123456789ABCDEFGHJKLMNPQRSTUVWXYZ234567',
  projectId: 'PLOT-001',
};

function sample(
  id: string,
  sampleDate: string,
  co2Kg: number | null,
  overrides: Partial<FieldSample> = {}
): FieldSample {
  return {
    id,
    sampleDate,
    co2Kg,
    measurementMethod: 'allometric',
    verificationStatus: 'verified',
    verifiedBy: 'reviewer@example.org',
    verifiedAt: `${sampleDate}T12:00:00Z`,
    ...overrides,
  };
}

describe('calculateFieldCredit', () => {
  it('converts the positive measured CO2 increase from kg to grams', () => {
    const result = calculateFieldCredit(
      [sample('baseline', '2024-01-01', 100), sample('latest', '2025-01-01', 112.345)],
      context
    );
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.credit.measuredDeltaKg).toBe(12.345);
      expect(result.credit.amountGrams).toBe(12_345);
      expect(result.credit.baselineSampleId).toBe('baseline');
      expect(result.credit.latestSampleId).toBe('latest');
      expect(result.credit.evidenceDigest).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('excludes pending, rejected, incomplete, unreviewed and satellite-derived samples', () => {
    const result = calculateFieldCredit(
      [
        sample('pending', '2023-01-01', 10, { verificationStatus: 'pending' }),
        sample('rejected', '2023-02-01', 20, { verificationStatus: 'rejected' }),
        sample('satellite', '2023-03-01', 30, { measurementMethod: 'satellite' }),
        sample('unreviewed', '2023-04-01', 40, { verifiedBy: null }),
        sample('baseline', '2024-01-01', 100),
        sample('latest', '2025-01-01', 110),
      ],
      context
    );
    expect(result.eligible).toBe(true);
    if (result.eligible) expect(result.credit.amountGrams).toBe(10_000);
  });

  it('requires two explicitly verified measurement points', () => {
    const result = calculateFieldCredit([sample('only', '2025-01-01', 5)], context);
    expect(result).toEqual({ eligible: false, reason: 'insufficient_verified_samples' });
  });

  it('measures only the interval after the last confirmed sample, avoiding double issuance', () => {
    const result = calculateFieldCredit(
      [
        sample('baseline', '2023-01-01', 100),
        sample('issued', '2024-01-01', 110),
        sample('latest', '2025-01-01', 116),
      ],
      context,
      'issued'
    );
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.credit.baselineSampleId).toBe('issued');
      expect(result.credit.latestSampleId).toBe('latest');
      expect(result.credit.amountGrams).toBe(6_000);
    }
  });

  it('fails closed if a previously issued baseline is no longer verified', () => {
    const result = calculateFieldCredit(
      [sample('newer', '2025-01-01', 120)],
      context,
      'removed-baseline'
    );
    expect(result).toEqual({ eligible: false, reason: 'issued_baseline_missing' });
  });

  it('rejects zero or negative deltas and non-safe gram amounts', () => {
    expect(
      calculateFieldCredit(
        [sample('a', '2024-01-01', 100), sample('b', '2025-01-01', 100)],
        context
      )
    ).toEqual({ eligible: false, reason: 'no_positive_delta' });
    expect(
      calculateFieldCredit(
        [sample('a', '2024-01-01', 1), sample('b', '2025-01-01', Number.MAX_SAFE_INTEGER)],
        context
      )
    ).toEqual({ eligible: false, reason: 'amount_out_of_range' });
  });

  it('produces a deterministic digest for the same measurement evidence', () => {
    const samples = [sample('a', '2024-01-01', 100), sample('b', '2025-01-01', 101.2)];
    const first = calculateFieldCredit(samples, context);
    const second = calculateFieldCredit([...samples].reverse(), context);
    expect(first.eligible && second.eligible && first.credit.evidenceDigest).toBe(
      second.eligible ? second.credit.evidenceDigest : undefined
    );
  });

  it('binds reviewer identity and review time into the evidence digest', () => {
    const samples = [sample('a', '2024-01-01', 100), sample('b', '2025-01-01', 101.2)];
    const original = calculateFieldCredit(samples, context);
    const updatedReview = calculateFieldCredit(
      [samples[0]!, sample('b', '2025-01-01', 101.2, { verifiedBy: 'another-reviewer' })],
      context
    );
    expect(original.eligible && updatedReview.eligible).toBe(true);
    if (original.eligible && updatedReview.eligible) {
      expect(original.credit.evidenceDigest).not.toBe(updatedReview.credit.evidenceDigest);
    }
  });
});
