/**
 * Provider selection — Issue #672
 *
 * `GFW_API_KEY` present  → real Global Forest Watch client.
 * Otherwise              → deterministic mock feed (GFW-shaped rows).
 *
 * The pull service additionally falls back to the mock feed when the live
 * client fails mid-run, so alerting keeps working without live credentials.
 */

import { createGfwAlertClient, isGfwConfigured } from './providers/gfw-client';
import { createMockDeforestationProvider } from './providers/mock-provider';
import type { DeforestationProvider } from './types';

/** The provider used for the next pull. */
export function getDeforestationProvider(): DeforestationProvider {
  if (isGfwConfigured()) return createGfwAlertClient();
  return createMockDeforestationProvider();
}

/** The mock feed used when the primary provider is unavailable. */
export function getFallbackProvider(now?: () => Date): DeforestationProvider {
  return createMockDeforestationProvider(now ? { now } : {});
}
