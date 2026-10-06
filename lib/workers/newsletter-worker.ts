import { getPool } from '@/lib/db/client';
import { sendNewsletterBatch } from '@/lib/email/sponsor-campaigns';
import logger from '@/lib/logger';

export async function processNewsletters(batchSize = 50): Promise<number> {
  const pool = getPool();
  const campaigns = await pool.query<{ id: string }>(
    `SELECT id FROM newsletter_campaigns WHERE status IN ('queued', 'sending') ORDER BY created_at LIMIT 10`
  );
  let processed = 0;
  for (const campaign of campaigns.rows) {
    const result = await sendNewsletterBatch(pool, campaign.id, batchSize);
    processed += result.sent;
  }
  logger.info('[newsletter-worker] batch complete', {
    campaigns: campaigns.rowCount ?? 0,
    processed,
  });
  return processed;
}

if (process.argv.includes('--once')) {
  processNewsletters()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('[newsletter-worker] failed', error);
      process.exit(1);
    });
}
