import cron from 'node-cron';
import { getPool } from '@/lib/db/client';
import { processBriefings } from '@/lib/volunteers/briefings';

async function run() {
  const result = await processBriefings(getPool());
  console.info('[volunteer-briefings]', result);
}

if (process.argv.includes('--once')) {
  run()
    .catch((error) => {
      console.error('[volunteer-briefings] failed', error);
      process.exitCode = 1;
    })
    .finally(() => getPool().end());
} else {
  cron.schedule(
    '*/5 * * * *',
    () => run().catch((error) => console.error('[volunteer-briefings] failed', error)),
    { noOverlap: true }
  );
}
