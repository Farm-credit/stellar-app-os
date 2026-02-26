'use client';

/**
 * ExampleFeaturePage.tsx
 * ────────────────────────────────────────────────────────────
 * Reference integration of the rate-limit UI.
 *
 * Paste the relevant pieces into whatever page / component
 * currently triggers your rate-limited backend action.
 * ────────────────────────────────────────────────────────────
 */

import { JSX, useState } from 'react';
import { useRateLimit } from '@/hooks/useRateLimit';
import type { RateLimitInfo } from '@/hooks/useRateLimit';
import { RateLimitBanner } from '@/components/RateLimitBanner';

// ---------------------------------------------------------------------------
// Mock data – replace this with real data from your API response / headers
// ---------------------------------------------------------------------------

const MOCK_RATE_LIMIT_INFO: RateLimitInfo = {
  limit: 100,
  remaining: 18, // set to 0 to see the blocked state
  resetAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(), // 3 min from now
};

// ---------------------------------------------------------------------------
// Helper: parse X-RateLimit-* headers into RateLimitInfo
//
// If your backend exposes standard rate-limit headers, call this after fetch:
//   const info = parseRateLimitHeaders(response.headers);
// ---------------------------------------------------------------------------

export function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  const limit = headers.get('X-RateLimit-Limit');
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset'); // unix epoch seconds

  if (!limit || !remaining || !reset) return null;

  const resetAt = new Date(parseInt(reset, 10) * 1000).toISOString();

  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    resetAt,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExampleFeaturePage(): JSX.Element {
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(
    MOCK_RATE_LIMIT_INFO,
  );
  const [status, setStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // The hook drives all derived state: isBlocked, isWarning, etc.
  const rateLimitState = useRateLimit(rateLimitInfo);
  const { isBlocked, timeRemainingFormatted, timeRemaining } = rateLimitState;

  // ---- Blocked-state action label ----------------------------------------

  const blockedLabel =
    isBlocked && timeRemainingFormatted !== null && timeRemaining !== null && timeRemaining > 0
      ? `Rate limit reached. Try again in ${timeRemainingFormatted}.`
      : 'Rate limit reached. Please wait.';

  // ---- Primary action -----------------------------------------------------

  async function handleSubmit(): Promise<void> {
    // Guard: do not call backend when blocked.
    // This check is belt-and-suspenders — the button is also disabled below.
    if (isBlocked) return;

    setIsLoading(true);
    setStatus('');

    try {
      const response = await fetch('/api/your-rate-limited-endpoint', {
        method: 'POST',
      });

      // Update rate-limit state from response headers after each call
      const newInfo = parseRateLimitHeaders(response.headers);
      if (newInfo) setRateLimitInfo(newInfo);

      if (!response.ok) throw new Error('Request failed');

      setStatus('Success!');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  }

  // ---- Render -------------------------------------------------------------

  return (
    <main style={{ maxWidth: '640px', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Feature Page</h1>

      {/* ── Rate limit banner (warning at 80%, block message at 100%) ── */}
      {/* Place this near the top of any section that triggers the action */}
      <RateLimitBanner rateLimitState={rateLimitState} />

      {/* ── Your existing UI ─────────────────────────────────────────── */}
      <section style={{ marginTop: '1.5rem' }}>
        <p>Fill in your form here…</p>

        {/*
          Action button:
          - disabled when isBlocked OR a request is in-flight
          - aria-disabled mirrors the disabled attribute for AT compatibility
          - aria-describedby links the button to the blocked explanation
        */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isBlocked || isLoading}
          aria-disabled={isBlocked || isLoading}
          aria-describedby={isBlocked ? 'rate-limit-blocked-msg' : undefined}
          style={{
            opacity: isBlocked ? 0.45 : 1,
            cursor: isBlocked ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? 'Sending…' : 'Submit'}
        </button>

        {/*
          Explanation shown below the button when blocked.
          id matches aria-describedby on the button so screen readers
          automatically associate the message.
        */}
        {isBlocked && (
          <p
            id="rate-limit-blocked-msg"
            role="status"
            aria-live="polite"
            style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b1515' }}
          >
            {blockedLabel}
          </p>
        )}

        {status && <p style={{ marginTop: '0.75rem' }}>{status}</p>}
      </section>
    </main>
  );
}