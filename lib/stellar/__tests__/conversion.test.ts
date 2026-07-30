import { describe, it, expect } from 'vitest';
import {
  computeSendMax,
  DEFAULT_CONVERSION_SLIPPAGE,
  MAX_CONVERSION_SLIPPAGE,
} from '../conversion';

describe('computeSendMax', () => {
  it('applies rate and slippage to the destination amount', () => {
    // 0.7 USDC at 10 XLM/USDC with 2% slippage → 0.7 * 10 * 1.02 = 7.14 XLM
    expect(computeSendMax(0.7, 10, 0.02)).toBe('7.1400000');
  });

  it('returns a 7-decimal (stroops-precision) string', () => {
    const result = computeSendMax(0.3, 10, 0.02);
    expect(result).toBe('3.0600000');
    expect(result.split('.')[1]).toHaveLength(7);
  });

  it('with zero slippage returns the exact converted amount', () => {
    expect(computeSendMax(5, 2, 0)).toBe('10.0000000');
  });

  it('scales linearly so split allocations sum to the whole', () => {
    const rate = 8;
    const planting = parseFloat(computeSendMax(0.7, rate, DEFAULT_CONVERSION_SLIPPAGE));
    const buffer = parseFloat(computeSendMax(0.3, rate, DEFAULT_CONVERSION_SLIPPAGE));
    const whole = parseFloat(computeSendMax(1, rate, DEFAULT_CONVERSION_SLIPPAGE));
    expect(planting + buffer).toBeCloseTo(whole, 7);
  });

  it('rejects a non-positive destination amount', () => {
    expect(() => computeSendMax(0, 10, 0.02)).toThrow(/positive/);
    expect(() => computeSendMax(-1, 10, 0.02)).toThrow(/positive/);
  });

  it('rejects a non-positive rate', () => {
    expect(() => computeSendMax(1, 0, 0.02)).toThrow(/rate/);
    expect(() => computeSendMax(1, -5, 0.02)).toThrow(/rate/);
  });

  it('rejects slippage outside the allowed range', () => {
    expect(() => computeSendMax(1, 10, -0.01)).toThrow(/slippage/);
    expect(() => computeSendMax(1, 10, MAX_CONVERSION_SLIPPAGE + 0.01)).toThrow(/slippage/);
  });

  it('accepts slippage at the boundaries', () => {
    expect(() => computeSendMax(1, 10, 0)).not.toThrow();
    expect(() => computeSendMax(1, 10, MAX_CONVERSION_SLIPPAGE)).not.toThrow();
  });
});
