'use client';

import { useCallback } from 'react';

/**
 * Visually-hidden live region used to announce dynamic updates to screen
 * readers without moving focus (WCAG 2.1 AAA — 4.1.3 Status Messages).
 *
 * Renders an `aria-live` region that is clipped to a single pixel so sighted
 * users never see it while assistive technology still receives updates.
 */
export function LiveRegion({
  id,
  message = '',
  assertive = false,
}: {
  id: string;
  message?: string;
  /** Use assertive only for interruptions that require immediate attention. */
  assertive?: boolean;
}) {
  return (
    <div
      id={id}
      className="sr-only"
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {message}
    </div>
  );
}

/**
 * Announce a message through a hidden live region.
 *
 * Falls back to creating the region on demand so callers do not need to
 * mount `<LiveRegion />` themselves. Repeated identical messages are
 * re-announced by clearing the region on one frame and writing the text on
 * the next (some screen readers suppress duplicate text otherwise).
 */
export function useAnnouncer(id = 'app-announcer', assertive = false) {
  return useCallback(
    (message: string) => {
      let region = document.getElementById(id) as HTMLElement | null;
      if (!region) {
        region = document.createElement('div');
        region.id = id;
        region.className = 'sr-only';
        region.setAttribute('role', assertive ? 'alert' : 'status');
        region.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
        region.setAttribute('aria-atomic', 'true');
        document.body.appendChild(region);
      }

      // Clear then write on the next frame so identical text re-announces.
      region.textContent = '';
      requestAnimationFrame(() => {
        region!.textContent = message;
      });
    },
    [id, assertive]
  );
}
