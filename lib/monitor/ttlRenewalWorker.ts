/**
 * Soroban Contract Storage TTL Renewal Worker
 *
 * Polls the configured Soroban contracts' instance storage TTL and submits
 * an ExtendFootprintTTL transaction whenever the remaining TTL falls below
 * TTL_RENEWAL_THRESHOLD_LEDGERS, so contract instances never expire.
 *
 * Run as a standalone Node.js process:
 *   tsx lib/monitor/ttlRenewalWorker.ts
 * or via the npm script:
 *   pnpm monitor:ttl-renewal
 */
import { runTtlRenewalCheck } from './ttlRenewal';
import logger from '@/lib/logger';

const DEFAULT_POLL_INTERVAL_MS = 3_600_000; // 1 hour
const POLL_INTERVAL_MS =
  Number(process.env.TTL_RENEWAL_POLL_INTERVAL_MS) || DEFAULT_POLL_INTERVAL_MS;

async function main(): Promise<void> {
  logger.info('[ttl-renewal-worker] starting', { pollIntervalMs: POLL_INTERVAL_MS });

  while (true) {
    try {
      const summary = await runTtlRenewalCheck();
      const renewed = summary.results.filter((r) => r.status === 'renewed').length;
      const errored = summary.results.filter((r) => r.status === 'error').length;
      logger.info('[ttl-renewal-worker] check complete', {
        checked: summary.results.length,
        renewed,
        errored,
      });
    } catch (err) {
      logger.error('[ttl-renewal-worker] unexpected error during check', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main();
