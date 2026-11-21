import { describe, expect, it } from 'vitest';
import {
  MOCK_CREDIT_TRACES,
  findCreditTrace,
  haversineKm,
  redactFarmer,
  summarizeTrace,
  toPublicTrace,
  verifyTrace,
  type CreditTrace,
} from '@/lib/marketplace/supplyChainTrace';

function trace(id = 'listing-001'): CreditTrace {
  const found = findCreditTrace(id);
  if (!found) throw new Error(`missing trace ${id}`);
  return structuredClone(found);
}

function codes(t: CreditTrace): string[] {
  return verifyTrace(t).issues.map((i) => i.code);
}

describe('findCreditTrace', () => {
  it('finds traces by listing id or batch id', () => {
    expect(findCreditTrace('listing-001')?.batchId).toBe('batch-br-2023-017');
    expect(findCreditTrace('batch-ke-2022-031')?.listingId).toBe('listing-005');
    expect(findCreditTrace('listing-002')).toBeUndefined();
  });
});

describe('seed traces', () => {
  it.each(MOCK_CREDIT_TRACES.map((t) => [t.batchId, t] as const))(
    '%s is fully verified',
    (_id, t) => {
      const result = verifyTrace(t);
      expect(result.issues).toEqual([]);
      expect(result.verified).toBe(true);
      expect(result.completeness).toBe(100);
    }
  );
});

describe('verifyTrace', () => {
  it('flags lifecycle stages recorded out of order', () => {
    const t = trace();
    t.events.find((e) => e.stage === 'listing')!.occurredAt = '2023-01-01T00:00:00Z';
    expect(codes(t)).toContain('EVENTS_OUT_OF_ORDER');
    expect(verifyTrace(t).verified).toBe(false);
  });

  it('allows repeated monitoring events after verification', () => {
    const t = trace();
    t.events.push({
      id: 'ev-extra',
      stage: 'monitoring',
      occurredAt: '2024-06-01T00:00:00Z',
      title: 'Annual survival check',
      description: '',
      actor: 'monitor',
    });
    expect(codes(t)).not.toContain('EVENTS_OUT_OF_ORDER');
  });

  it('flags missing required stages', () => {
    const t = trace();
    t.events = t.events.filter((e) => e.stage !== 'verification');
    const result = verifyTrace(t);
    expect(result.issues.map((i) => i.message)).toContain('No verification event recorded');
    expect(result.completeness).toBeLessThan(100);
  });

  it('flags issuance before verification', () => {
    const t = trace();
    t.events.find((e) => e.stage === 'issuance')!.occurredAt = '2023-10-01T00:00:00Z';
    expect(codes(t)).toContain('ISSUED_BEFORE_VERIFICATION');
  });

  it('flags credits issued beyond measured sequestration', () => {
    const t = trace();
    t.issuedTonnes = 100;
    expect(codes(t)).toContain('OVER_ISSUED');
  });

  it('warns about missing and off-site photo evidence without failing verification', () => {
    const t = trace();
    t.photos = t.photos.filter((p) => p.stage !== 'sequestration');
    t.photos[0].location = { lat: -1.9, lng: -48.5 }; // ~50 km south
    const result = verifyTrace(t);
    expect(result.verified).toBe(true);
    expect(result.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        'MISSING_PHOTO_EVIDENCE',
        'PHOTO_OFF_SITE',
        'UNKNOWN_PHOTO_REFERENCE',
      ])
    );
  });
});

describe('summarizeTrace', () => {
  it('summarises age, sequestration and on-chain anchoring', () => {
    const summary = summarizeTrace(trace(), new Date('2023-02-10T09:00:00Z'));
    expect(summary.daysSincePlanting).toBe(365);
    expect(summary.latestSequestrationTonnes).toBe(58.2);
    expect(summary.issuanceCoverage).toBeCloseTo(50.5 / 58.2, 5);
    expect(summary.onChainEvents).toBe(3);
  });
});

describe('farmer privacy', () => {
  it('redacts farmers who have not consented', () => {
    const farmer = trace('listing-003').farmer;
    const redacted = redactFarmer({ ...farmer, photoUrl: 'https://x/y.jpg' });
    expect(redacted.name).toBe('Farmer B. S.');
    expect(redacted.photoUrl).toBeUndefined();
    expect(redacted.bio).toBe(farmer.bio);
  });

  it('leaves consenting farmers untouched', () => {
    const farmer = trace('listing-001').farmer;
    expect(redactFarmer(farmer)).toEqual(farmer);
  });

  it('public traces are redacted and chronologically ordered', () => {
    const t = trace('listing-003');
    t.events.reverse();
    const pub = toPublicTrace(t);
    expect(pub.farmer.name).toBe('Farmer B. S.');
    expect(pub.events[0].stage).toBe('planting');
  });
});

describe('haversineKm', () => {
  it('measures great-circle distance', () => {
    // One degree of latitude is ~111 km.
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
    expect(haversineKm({ lat: 10, lng: 10 }, { lat: 10, lng: 10 })).toBe(0);
  });
});
