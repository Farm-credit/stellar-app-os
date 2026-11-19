/**
 * Deforestation alert worker — Issue #672
 *
 * Periodically pulls canopy-loss alerts for every monitored zone and notifies
 * project managers / sponsors about new detections.
 *
 * Usage:
 *   pnpm deforestation:pull        # single pull, then exit (--once)
 *   tsx lib/workers/deforestation-alerts.ts --interval   # loop every 6 hours
 */

import { pullDeforestationAlerts } from '@/lib/deforestation/service';
import type { PullSummary } from '@/lib/deforestation/types';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/** Run one pull and log a compact summary. */
export async function runDeforestationPullOnce(): Promise<PullSummary> {
  const summary = await pullDeforestationAlerts();
  console.info(
    `[deforestation] provider=${summary.provider} zones=${summary.zonesChecked} new=${summary.newAlertCount} emails=${summary.emailsSent}` +
      (summary.usedFallback ? ' (mock fallback)' : '') +
      (summary.errors.length ? ` errors=${summary.errors.length}` : '')
  );
  for (const error of summary.errors) {
    console.warn(`[deforestation] ${error}`);
  }
  return summary;
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');

  await runDeforestationPullOnce();
  if (once) return;

  const timer = setInterval(() => {
    void runDeforestationPullOnce().catch((error) => {
      console.error('[deforestation] pull failed:', error);
    });
  }, SIX_HOURS_MS);
  // Don't let the interval keep a handle that prevents graceful shutdown.
  timer.unref?.();
}

if (process.argv.includes('--once') || process.argv.includes('--interval')) {
  main().catch((error) => {
    console.error('[deforestation] worker crashed:', error);
    process.exitCode = 1;
  });
}
