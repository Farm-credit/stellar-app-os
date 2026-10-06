import { runFraudScan } from './fraud';

const POLL_INTERVAL_MS = Number(process.env.FRAUD_SCAN_INTERVAL_MS) || 15 * 60 * 1000;

/**
 * Fraud-detection monitor worker (issue #1319). Runs the anomaly detectors on
 * a fixed interval and persists alerts for investigation. Follows the same
 * long-running loop pattern as lib/monitor/worker.ts (treasury monitor).
 *
 * Usage: pnpm monitor:fraud   (see package.json)
 */
async function main(): Promise<void> {
  console.info('[fraud-monitor] starting, scan interval %dms', POLL_INTERVAL_MS);

  while (true) {
    try {
      const result = await runFraudScan();
      console.info(
        '[fraud-monitor] scan complete: %d alerts created, %d updated, %d planters, %d trees',
        result.alertsCreated,
        result.alertsUpdated,
        result.plantersScanned,
        result.treesScanned
      );
    } catch (err) {
      console.error('[fraud-monitor] scan error:', err);
    }

    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

void main();
