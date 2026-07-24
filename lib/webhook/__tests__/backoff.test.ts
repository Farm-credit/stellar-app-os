import { describe, it, expect } from 'vitest';
import { computeBackoffMs, nextAttemptAt } from '@/lib/webhook/backoff';

const noJitter = { jitterRatio: 0, baseDelayMs: 30_000, maxDelayMs: 900_000 };

describe('exponential backoff', () => {
  it('doubles each attempt without jitter', () => {
    expect(computeBackoffMs(1, noJitter)).toBe(30_000);
    expect(computeBackoffMs(2, noJitter)).toBe(60_000);
    expect(computeBackoffMs(3, noJitter)).toBe(120_000);
    expect(computeBackoffMs(4, noJitter)).toBe(240_000);
    expect(computeBackoffMs(5, noJitter)).toBe(480_000);
  });

  it('caps at maxDelayMs', () => {
    expect(computeBackoffMs(6, noJitter)).toBe(900_000);
    expect(computeBackoffMs(20, noJitter)).toBe(900_000);
  });

  it('treats attempts below 1 as the first attempt', () => {
    expect(computeBackoffMs(0, noJitter)).toBe(30_000);
    expect(computeBackoffMs(-5, noJitter)).toBe(30_000);
  });

  it('keeps jittered delays within +/- ratio of the base schedule', () => {
    const ratio = 0.2;
    for (let i = 0; i < 200; i++) {
      const v = computeBackoffMs(2, { ...noJitter, jitterRatio: ratio });
      expect(v).toBeGreaterThanOrEqual(60_000 * (1 - ratio) - 1);
      expect(v).toBeLessThanOrEqual(60_000 * (1 + ratio) + 1);
    }
  });

  it('never returns a negative delay', () => {
    for (let i = 0; i < 100; i++) {
      expect(
        computeBackoffMs(1, { baseDelayMs: 1, maxDelayMs: 10, jitterRatio: 5 })
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('nextAttemptAt offsets from the given base time', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const at = nextAttemptAt(1, noJitter, from);
    expect(at.getTime()).toBe(from.getTime() + 30_000);
  });
});
