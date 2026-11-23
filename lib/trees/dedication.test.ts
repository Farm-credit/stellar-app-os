import { describe, expect, it } from 'vitest';
import {
  MAX_DEDICATION_LENGTH,
  buildDedicationCardImageUrl,
  normalizeDedication,
  validateDedication,
} from './dedication';

describe('tree dedication utilities', () => {
  it('returns undefined for empty or whitespace-only dedications', () => {
    expect(normalizeDedication(undefined)).toBeUndefined();
    expect(normalizeDedication(null)).toBeUndefined();
    expect(normalizeDedication('')).toBeUndefined();
    expect(normalizeDedication('   \n\t  ')).toBeUndefined();
  });

  it('trims and clamps dedications to 200 characters', () => {
    const longText = `  ${'a'.repeat(250)}  `;
    const normalized = normalizeDedication(longText);
    expect(normalized).toHaveLength(MAX_DEDICATION_LENGTH);
    expect(normalized).toBe('a'.repeat(200));
  });

  it('validates dedication length against the 200-char limit', () => {
    expect(validateDedication('In memory of Ada')).toEqual({
      valid: true,
      remaining: 184,
    });

    expect(validateDedication('x'.repeat(200))).toEqual({
      valid: true,
      remaining: 0,
    });

    const over = validateDedication('x'.repeat(201));
    expect(over.valid).toBe(false);
    expect(over.remaining).toBe(-1);
    expect(over.error).toContain('200');
  });

  it('builds the auto-generated dedication card image URL', () => {
    expect(buildDedicationCardImageUrl('tree-001')).toBe('/api/trees/tree-001/dedication-card');
    expect(buildDedicationCardImageUrl('tree-001', 'For Mom')).toBe(
      '/api/trees/tree-001/dedication-card?dedication=For%20Mom'
    );
  });
});
