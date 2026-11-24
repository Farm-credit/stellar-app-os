import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { logger } from '../lib/logger';
import { sendEmail } from '../lib/email';
import {
  getWeeklySponsorDigestData,
  buildWeeklySponsorDigestEmail,
} from '../lib/weekly-sponsor-digest';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const LOCK_PREFIX = 'weekly-digest:lock:';
const LOCK_TTL_SECONDS = 60 * 10;

function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  // Week starts on Monday (UTC)
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function acquireLock(key: string): Promise<boolean> {
  const result = await redis.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

async function releaseLock(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    logger.error({ err, key }, 'Failed to release weekly digest lock');
  }
}

async function processSponsor(
  sponsorId: string,
  weekStart: Date,
): Promise<void> {
  const lockKey = `${LOCK_PREFIX}${sponsorId}`;
  const acquired = await acquireLock(lockKey);
  if (!acquired) {
    logger.info(
      { sponsorId },
      'Weekly digest lock already held, skipping sponsor',
    );
    return;
  }

  try {
    // Skip if already sent this week
    const existing = await prisma.weeklySponsorDigest.findFirst({
      where: { sponsorId, weekStart },
    });
    if (existing) {
      logger.info(
        { sponsorId, weekStart },
        'Weekly digest already sent this week, skipping',
      );
      return;
    }

    const digestData = await getWeeklySponsorDigestData(sponsorId, weekStart);
    if (!digestData) {
      logger.warn(
        { sponsorId, weekStart },
        'No weekly digest data available for sponsor',
      );
      return;
    }

    const email = buildWeeklySponsorDigestEmail(digestData);

    try {
      await sendEmail({
        to: digestData.sponsorEmail,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      await prisma.weeklySponsorDigest.create({
        data: {
          sponsorId,
          weekStart,
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      logger.info({ sponsorId, weekStart }, 'Weekly digest sent successfully');
    } catch (err) {
      logger.error(
        { err, sponsorId, weekStart },
        'Failed to send weekly digest',
      );

      try {
        await prisma.weeklySponsorDigest.create({
          data: {
            sponsorId,
            weekStart,
            status: 'FAILED',
            error: err instanceof Error ? err.message : String(err),
          },
        });
      } catch (persistErr) {
        logger.error(
          { err: persistErr, sponsorId, weekStart },
          'Failed to persist weekly digest failure status',
        );
      }
    }
  } finally {
    await releaseLock(lockKey);
  }
}

async function run(): Promise<void> {
  const weekStart = getWeekStart();
  logger.info({ weekStart }, 'Starting weekly sponsor digest run');

  try {
    const sponsors = await prisma.sponsor.findMany({
      where: {
        weeklyDigestEnabled: true,
      },
      select: { id: true },
    });

    logger.info(
      { count: sponsors.length, weekStart },
      'Found sponsors with weekly digest enabled',
    );

    for (const sponsor of sponsors) {
      try {
        await processSponsor(sponsor.id, weekStart);
      } catch (err) {
        logger.error(
          { err, sponsorId: sponsor.id, weekStart },
          'Unexpected error processing sponsor weekly digest',
        );
      }
    }

    logger.info({ weekStart }, 'Weekly sponsor digest run completed');
  } catch (err) {
    logger.error({ err, weekStart }, 'Weekly sponsor digest run failed');
    process.exitCode = 1;
  } finally {
    try {
      await prisma.$disconnect();
    } catch (err) {
      logger.error({ err }, 'Failed to disconnect Prisma');
    }
    try {
      await redis.quit();
    } catch (err) {
      logger.error({ err }, 'Failed to disconnect Redis');
    }
  }
}

run().catch((err) => {
  logger.error({ err }, 'Fatal error in weekly sponsor digest script');
  process.exitCode = 1;
});