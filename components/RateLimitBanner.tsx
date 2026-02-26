'use client';

import { JSX, useState } from 'react';
import { PiWarningBold, PiProhibitBold, PiXBold } from 'react-icons/pi';
import type { RateLimitState } from '@/hooks/useRateLimit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RateLimitBannerProps {
  rateLimitState: RateLimitState;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * RateLimitBanner
 *
 * - Renders nothing when there is no warning / block condition.
 * - Shows a dismissible warning banner at 80 % usage (role="status", polite).
 * - Shows a persistent blocked banner at 100 % usage (role="alert", assertive).
 *
 * Accessibility:
 *   - role="alert"  + aria-live="assertive" → blocked  (urgent)
 *   - role="status" + aria-live="polite"    → warning  (non-urgent)
 *   - Countdown <span> has its own aria-live="polite" so screen readers
 *     announce timer updates without re-reading the whole sentence.
 *   - Icons are aria-hidden; text alone conveys meaning.
 *   - Dismiss button has an explicit aria-label.
 *   - Tailwind amber / red scales satisfy WCAG 4.5:1 contrast requirement.
 */
export function RateLimitBanner({ rateLimitState }: RateLimitBannerProps): JSX.Element | null {
  const [dismissed, setDismissed] = useState<boolean>(false);

  const { isWarning, isBlocked, percentUsed, timeRemainingFormatted, timeRemaining } =
    rateLimitState;

  if (!isWarning && !isBlocked) return null;
  if (isWarning && dismissed) return null;

  const hasCountdown =
    timeRemainingFormatted !== null && timeRemaining !== null && timeRemaining > 0;

  // ── Blocked ─────────────────────────────────────────────────────────────

  if (isBlocked) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="flex items-start gap-3 rounded-lg border border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800"
      >
        <PiProhibitBold aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
        <p className="min-w-0 flex-1">
          <strong className="font-semibold">Rate limit reached.</strong>
          {hasCountdown ? (
            <>
              {' '}
              You can try again in{' '}
              <span aria-live="polite" aria-atomic="true" className="font-bold tabular-nums">
                {timeRemainingFormatted}
              </span>
              .
            </>
          ) : (
            <> Please wait a moment.</>
          )}
        </p>
      </div>
    );
  }

  // ── Warning ──────────────────────────────────────────────────────────────

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="flex items-start gap-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <PiWarningBold aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
      <p className="min-w-0 flex-1">
        <strong className="font-semibold">{percentUsed}% of your request limit used.</strong>
        {hasCountdown && (
          <>
            {' '}
            Resets in{' '}
            <span aria-live="polite" aria-atomic="true" className="font-bold tabular-nums">
              {timeRemainingFormatted}
            </span>
            .
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss rate limit warning"
        className="ml-auto flex min-h-[2.75rem] min-w-[2.75rem] shrink-0 items-center justify-center rounded p-1 text-amber-700 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
      >
        <PiXBold aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}