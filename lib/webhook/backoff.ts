/**
 * Exponential backoff schedule for webhook delivery retries.
 *
 * Delay for the Nth retry (1-indexed) is:
 *
 *   min(BASE * 2^(attempt-1), MAX)  +/-  full jitter
 *
 * Jitter spreads simultaneous retries so a recovering planter backend isn't
 * hit by a thundering herd. With the defaults the (un-jittered) schedule is:
 *
 *   attempt 1 →   30s
 *   attempt 2 →   60s
 *   attempt 3 →  120s
 *   attempt 4 →  240s
 *   attempt 5 →  480s
 *   attempt 6 →  900s (capped)
 */

export interface BackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Fraction of the delay applied as +/- random jitter (0 disables). */
  jitterRatio?: number;
}

export const DEFAULT_BASE_DELAY_MS = 30_000; // 30s
export const DEFAULT_MAX_DELAY_MS = 900_000; // 15m
export const DEFAULT_JITTER_RATIO = 0.2;

/** Default total attempts (1 initial + 5 retries) before a delivery is failed. */
export const DEFAULT_MAX_ATTEMPTS = 6;

/**
 * Milliseconds to wait before the given retry attempt.
 *
 * @param attempt 1-indexed retry number (1 = first retry after initial failure)
 */
export function computeBackoffMs(attempt: number, options: BackoffOptions = {}): number {
  const {
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    jitterRatio = DEFAULT_JITTER_RATIO,
  } = options;

  const safeAttempt = Math.max(1, Math.floor(attempt));
  // 2^(attempt-1) without Math.pow overflow concerns for our small attempt counts.
  const exponential = baseDelayMs * 2 ** (safeAttempt - 1);
  const capped = Math.min(exponential, maxDelayMs);

  if (jitterRatio <= 0) {
    return capped;
  }

  // Full +/- jitter, clamped to non-negative.
  const jitter = capped * jitterRatio * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(capped + jitter));
}

/**
 * Timestamp at which the given retry attempt becomes eligible.
 *
 * @param attempt 1-indexed retry number
 * @param from    base time (defaults to now)
 */
export function nextAttemptAt(
  attempt: number,
  options: BackoffOptions = {},
  from: Date = new Date()
): Date {
  return new Date(from.getTime() + computeBackoffMs(attempt, options));
}
