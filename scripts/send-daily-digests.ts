import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { renderDigestEmail, sendEmail } from '../lib/notifications';
import { logger } from '../lib/logger';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

const DIGEST_HOUR = 9;
const LOCK_TTL_SECONDS = 60 * 30;
const LOCK_PREFIX = 'digest:lock:';

interface PendingEvent {
  id: string;
  sponsorId: string;
  type: string;
  payload: unknown;
  createdAt: Date;
}

interface SponsorWithEvents {
  id: string;
  email: string;
  name: string | null;
  timezone: string | null;
  notificationEvents: PendingEvent[];
}

/**
 * Returns the current hour (0-23) in the given IANA timezone.
 */
function getLocalHour(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hourPart = parts.find((p) => p.type === 'hour');
  const hour = hourPart ? parseInt(hourPart.value, 10) : NaN;
  // Intl may return "24" for midnight in some environments.
  return Number.isNaN(hour) ? 0 : hour % 24;
}

/**
 * Returns the local date string (YYYY-MM-DD) in the given IANA timezone.
 */
function getLocalDateString(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

async function acquireLock(sponsorId: string): Promise<boolean> {
  const key = `${LOCK_PREFIX}${sponsorId}`;
  const result = await redis.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

async function releaseLock(sponsorId: string): Promise<void> {
  const key = `${LOCK_PREFIX}${sponsorId}`;
  await redis.del(key);
}

async function hasDigestToday(sponsorId: string, localDate: string): Promise<boolean> {
  const existing = await prisma.emailDigest.findFirst({
    where: {
      sponsorId,
      localDate,
    },
    select: { id: true },
  });
  return existing !== null;
}

async function processSponsor(
  sponsor: SponsorWithEvents,
  now: Date,
): Promise<void> {
  const timeZone =
    sponsor.timezone && isValidTimeZone(sponsor.timezone)
      ? sponsor.timezone
      : 'UTC';

  const localHour = getLocalHour(now, timeZone);
  if (localHour < DIGEST_HOUR) {
    return;
  }

  const localDate = getLocalDateString(now, timeZone);

  if (await hasDigestToday(sponsor.id, localDate)) {
    return;
  }

  const locked = await acquireLock(sponsor.id);
  if (!locked) {
    logger.debug(
      { sponsorId: sponsor.id },
      'Digest lock already held, skipping',
    );
    return;
  }

  try {
    // Re-check after acquiring the lock to stay idempotent under concurrency.
    if (await hasDigestToday(sponsor.id, localDate)) {
      return;
    }

    const events = sponsor.notificationEvents;
    if (events.length === 0) {
      return;
    }

    const rendered = renderDigestEmail({
      sponsorName: sponsor.name ?? undefined,
      events: events.map((e) => ({
        type: e.type,
        payload: e.payload,
        createdAt: e.createdAt,
      })),
    });

    await sendEmail({
      to: sponsor.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    const eventIds = events.map((e) => e.id);

    await prisma.$transaction([
      prisma.notificationEvent.updateMany({
        where: { id: { in: eventIds } },
        data: { deliveredAt: now },
      }),
      prisma.emailDigest.create({
        data: {
          sponsorId: sponsor.id,
          localDate,
          eventCount: events.length,
          sentAt: now,
        },
      }),
    ]);

    logger.info(
      {
        sponsorId: sponsor.id,
        eventCount: events.length,
        localDate,
        timeZone,
      },
      'Sent daily digest',
    );
  } catch (err) {
    logger.error(
      { err, sponsorId: sponsor.id },
      'Failed to send daily digest',
    );
  } finally {
    await releaseLock(sponsor.id);
  }
}

async function run(): Promise<void> {
  const now = new Date();
  logger.info({ now: now.toISOString() }, 'Starting daily digest run');

  const sponsors = (await prisma.sponsor.findMany({
    where: {
      notificationEvents: {
        some: {
          deliveredAt: null,
        },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      timezone: true,
      notificationEvents: {
        where: { deliveredAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          sponsorId: true,
          type: true,
          payload: true,
          createdAt: true,
        },
      },
    },
  })) as SponsorWithEvents[];

  logger.info({ sponsorCount: sponsors.length }, 'Loaded sponsors with pending events');

  for (const sponsor of sponsors) {
    await processSponsor(sponsor, now);
  }

  logger.info('Daily digest run complete');
}

run()
  .catch((err) => {
    logger.error({ err }, 'Daily digest run failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await redis.quit();
  });