import type { ApiKeyTier } from '@/lib/db/schema';

/**
 * Tiered rate-limit configuration.
 *
 * Each tier defines an hourly request budget for a single API key. The
 * premium tier is intentionally unbounded (no hourly cap) while still
 * allowing requests to be queued for smooth delivery.
 */
export const API_KEY_TIERS: Record<ApiKeyTier, { requestsPerHour: number | null; label: string }> =
  {
    free: { requestsPerHour: 100, label: 'Free' },
    standard: { requestsPerHour: 1000, label: 'Standard' },
    // null => unlimited
    premium: { requestsPerHour: null, label: 'Premium' },
  };

export const API_KEY_TIER_NAMES = ['free', 'standard', 'premium'] as const;

/** Returns the hourly budget for a tier, or null when the tier is unlimited. */
export function hourlyBudget(tier: ApiKeyTier): number | null {
  return API_KEY_TIERS[tier].requestsPerHour;
}

export function isApiKeyTier(value: unknown): value is ApiKeyTier {
  return typeof value === 'string' && API_KEY_TIERS[value as ApiKeyTier] !== undefined;
}
