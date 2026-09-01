import { checkAndAlert, sendDailySummary } from './treasury';

const POLL_INTERVAL_MS = Number(process.env.TREASURY_POLL_INTERVAL_MS) || 300_000;
const DAILY_SUMMARY_CRON = process.env.TREASURY_DAILY_SUMMARY_CRON ?? '0 8 * * *';

function parseCronSchedule(cron: string): { hour: number; minute: number } {
  const parts = cron.split(/\s+/);
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  return { hour: Number.isNaN(hour) ? 8 : hour, minute: Number.isNaN(minute) ? 0 : minute };
}

function shouldRunDailySummary(lastRunDay: number | null): boolean {
  const { hour, minute } = parseCronSchedule(DAILY_SUMMARY_CRON);
  const now = new Date();
  const currentMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const targetMinute = hour * 60 + minute;
  const today = now.getUTCDate() | (now.getUTCMonth() << 5) | (now.getUTCFullYear() << 9);

  if (lastRunDay === today) return false;
  if (Math.abs(currentMinute - targetMinute) > 5) return false;

  return true;
}

async function main() {
  console.info('[treasury-monitor] starting, check interval %dms', POLL_INTERVAL_MS);
  let dailySummaryLastRun: number | null = null;

  while (true) {
    try {
      await checkAndAlert();
      console.info('[treasury-monitor] balance check complete');
    } catch (err) {
      console.error('[treasury-monitor] balance check error:', err);
    }

    try {
      if (shouldRunDailySummary(dailySummaryLastRun)) {
        await sendDailySummary();
        dailySummaryLastRun =
          new Date().getUTCDate() |
          (new Date().getUTCMonth() << 5) |
          (new Date().getUTCFullYear() << 9);
        console.info('[treasury-monitor] daily summary sent');
      }
    } catch (err) {
      console.error('[treasury-monitor] daily summary error:', err);
    }

    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main();
