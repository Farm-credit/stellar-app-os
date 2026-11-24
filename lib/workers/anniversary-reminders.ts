/**
 * Sponsorship anniversary reminder worker — Issue #1647
 *
 * Runs daily and emails each sponsor whose tree reaches its planting
 * anniversary today (latest health photo + cumulative CO₂ + social card).
 *
 * Usage:
 *   pnpm email:anniversaries:send                    # single run, then exit (--once)
 *   tsx lib/workers/anniversary-reminders.ts --interval   # loop every 24 hours
 */

import { sendDueAnniversaryReminders } from '@/lib/sponsorship/anniversary';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** Run one pass and log a compact summary. */
export async function runAnniversaryPass(now = new Date()): Promise<void> {
  const summary = await sendDueAnniversaryReminders({ now });
  console.info(
    `[anniversaries] due=${summary.due} sent=${summary.sent} skipped=${summary.skipped}`
  );
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');

  await runAnniversaryPass();
  if (once) return;

  const timer = setInterval(() => {
    void runAnniversaryPass().catch((error) => {
      console.error('[anniversaries] pass failed:', error);
    });
  }, TWENTY_FOUR_HOURS_MS);
  timer.unref?.();
}

if (process.argv.includes('--once') || process.argv.includes('--interval')) {
  main().catch((error) => {
    console.error('[anniversaries] worker crashed:', error);
    process.exitCode = 1;
  });
}
