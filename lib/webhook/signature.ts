/**
 * HMAC signing & verification for outward webhooks.
 *
 * Every dispatched request carries three headers the planter backend uses to
 * authenticate it:
 *
 *   X-Webhook-Id         the stable event id (UUID), shared across retries
 *   X-Webhook-Timestamp  unix seconds when the request was signed
 *   X-Webhook-Signature  v1=<hex HMAC-SHA256 of "<timestamp>.<rawBody>">
 *
 * The timestamp is folded into the signed string (Stripe-style) so a captured
 * request cannot be replayed indefinitely — receivers reject signatures whose
 * timestamp is outside a tolerance window.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Header names, exported so receivers and tests don't hard-code strings. */
export const WEBHOOK_HEADERS = {
  id: 'X-Webhook-Id',
  timestamp: 'X-Webhook-Timestamp',
  signature: 'X-Webhook-Signature',
} as const;

/** Reject signatures older than this (seconds) to bound replay attacks. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

/** Build the signed string. Exported so verification stays byte-identical. */
export function buildSignedPayload(timestamp: number, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

/** Compute the hex HMAC-SHA256 signature for a raw body at a given timestamp. */
export function computeSignature(rawBody: string, secret: string, timestamp: number): string {
  return createHmac('sha256', secret).update(buildSignedPayload(timestamp, rawBody)).digest('hex');
}

/**
 * Headers to attach to an outgoing webhook POST.
 *
 * @param rawBody   the exact serialized JSON body that will be sent
 * @param secret    the subscription's signing secret
 * @param eventId   the stable event id (UUID) for X-Webhook-Id
 * @param timestamp unix seconds; defaults to now (override for deterministic tests)
 */
export function buildSignatureHeaders(
  rawBody: string,
  secret: string,
  eventId: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): Record<string, string> {
  const signature = computeSignature(rawBody, secret, timestamp);
  return {
    [WEBHOOK_HEADERS.id]: eventId,
    [WEBHOOK_HEADERS.timestamp]: String(timestamp),
    [WEBHOOK_HEADERS.signature]: `v1=${signature}`,
  };
}

/** Constant-time comparison of two hex signatures of equal logical length. */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  // timingSafeEqual throws on length mismatch; guard first (length is not secret).
  if (bufA.length === 0 || bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Strip an optional `v1=` scheme prefix from a signature header value. */
function parseSignatureHeader(header: string): string {
  const trimmed = header.trim();
  return trimmed.startsWith('v1=') ? trimmed.slice(3) : trimmed;
}

export interface VerifyOptions {
  toleranceSeconds?: number;
  /** unix seconds, override for deterministic tests; defaults to now */
  now?: number;
}

/**
 * Verify an incoming webhook signature. Intended for planter backends and for
 * round-trip tests of this module. Returns true only when the signature matches
 * AND the timestamp is within tolerance.
 */
export function verifySignature(
  rawBody: string,
  secret: string,
  timestampHeader: string,
  signatureHeader: string,
  options: VerifyOptions = {}
): boolean {
  const { toleranceSeconds = DEFAULT_TOLERANCE_SECONDS, now = Math.floor(Date.now() / 1000) } =
    options;

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  // Reject stale (or absurdly future-dated) timestamps.
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  const expected = computeSignature(rawBody, secret, timestamp);
  return safeEqualHex(expected, parseSignatureHeader(signatureHeader));
}
