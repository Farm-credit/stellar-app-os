export const MAX_DEDICATION_LENGTH = 200;

export interface DedicationValidationResult {
  valid: boolean;
  error?: string;
  remaining: number;
}

/**
 * Trims a dedication string and returns `undefined` when empty.
 * Clamps to `MAX_DEDICATION_LENGTH` characters if longer.
 */
export function normalizeDedication(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_DEDICATION_LENGTH);
}

/**
 * Validates a dedication inscription against the 200-character limit.
 */
export function validateDedication(value: string): DedicationValidationResult {
  const remaining = MAX_DEDICATION_LENGTH - value.length;
  if (value.length > MAX_DEDICATION_LENGTH) {
    return {
      valid: false,
      error: `Dedication must be ${MAX_DEDICATION_LENGTH} characters or fewer.`,
      remaining,
    };
  }
  return { valid: true, remaining };
}

/**
 * Builds the URL for the auto-generated shareable dedication card image.
 */
export function buildDedicationCardImageUrl(treeId: string, dedication?: string): string {
  const base = `/api/trees/${encodeURIComponent(treeId)}/dedication-card`;
  const normalized = normalizeDedication(dedication);
  if (!normalized) return base;
  return `${base}?dedication=${encodeURIComponent(normalized)}`;
}
