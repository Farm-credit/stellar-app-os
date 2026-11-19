import { PrismaClient } from '@prisma/client';
import { sendBatchNewsletter } from '../lib/notifications';
import { MemoryRateLimiter } from '../lib/rate-limit';
import { getSponsorsBySegment } from '../lib/sponsors';
import logger from '../lib/logger';

const prisma = new PrismaClient();

const EMAILS_PER_SECOND = 10;

interface RecipientResult {
  recipientId: string;
  email: string;
  status: 'sent' | 'failed' | 'unsubscribed';
  error?: string;
}

function resolveCampaignId(): string {
  const fromArgv = process.argv[2];
  const fromEnv = process.env.NEWSLETTER_CAMPAIGN_ID;
  const campaignId = fromArgv || fromEnv;

  if (!campaignId) {
    throw new Error(
      'Missing campaign id. Provide it as the first argument or set NEWSLETTER_CAMPAIGN_ID.',
    );
  }

  return campaignId;
}

async function loadCampaign(campaignId: string) {
  const campaign = await prisma.newsletterCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new Error(`NewsletterCampaign not found: ${campaignId}`);
  }

  return campaign;
}

async function loadPendingRecipients(campaignId: string) {
  return prisma.newsletterRecipient.findMany({
    where: {
      campaignId,
      status: 'pending',
    },
  });
}

async function populateRecipientsFromSegment(campaignId: string, segment: string) {
  logger.info({ campaignId, segment }, 'No pending recipients found; resolving from segment');

  const sponsors = await getSponsorsBySegment(segment);

  if (sponsors.length === 0) {
    logger.warn({ campaignId, segment }, 'Segment resolved to zero sponsors');
    return [];
  }

  const data = sponsors.map((sponsor) => ({
    campaignId,
    sponsorId: sponsor.id,
    email: sponsor.email,
    status: 'pending' as const,
  }));

  await prisma.newsletterRecipient.createMany({
    data,
    skipDuplicates: true,
  });

  logger.info(
    { campaignId, segment, count: data.length },
    'Populated newsletter recipients from segment',
  );

  return loadPendingRecipients(campaignId);
}

async function updateRecipientStatus(
  recipientId: string,
  status: 'sent' | 'failed' | 'unsubscribed',
  error?: string,
) {
  await prisma.newsletterRecipient.update({
    where: { id: recipientId },
    data: {
      status,
      error: error ?? null,
      sentAt: status === 'sent' ? new Date() : undefined,
    },
  });
}

async function updateCampaignStatus(
  campaignId: string,
  status: 'sending' | 'completed' | 'failed',
  recipientCount?: number,
) {
  await prisma.newsletterCampaign.update({
    where: { id: campaignId },
    data: {
      status,
      ...(recipientCount !== undefined ? { recipientCount } : {}),
    },
  });
}

async function run() {
  const campaignId = resolveCampaignId();
  logger.info({ campaignId }, 'Starting newsletter campaign send');

  const campaign = await loadCampaign(campaignId);

  let recipients = await loadPendingRecipients(campaignId);

  if (recipients.length === 0) {
    recipients = await populateRecipientsFromSegment(campaignId, campaign.segment);
  }

  if (recipients.length === 0) {
    logger.warn({ campaignId }, 'No recipients to send to; marking campaign completed');
    await updateCampaignStatus(campaignId, 'completed', 0);
    return;
  }

  await updateCampaignStatus(campaignId, 'sending');

  const rateLimiter = new MemoryRateLimiter({
    maxRequests: EMAILS_PER_SECOND,
    windowMs: 1000,
  });

  const results: RecipientResult[] = [];
  let sentCount = 0;
  let failedCount = 0;
  let unsubscribedCount = 0;

  const total = recipients.length;
  logger.info({ campaignId, total }, 'Sending newsletter to recipients');

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];

    try {
      await rateLimiter.acquire();

      const response = await sendBatchNewsletter({
        to: recipient.email,
        subject: campaign.subject,
        body: campaign.body,
        campaignId,
      });

      if (response && response.unsubscribed) {
        await updateRecipientStatus(recipient.id, 'unsubscribed');
        unsubscribedCount++;
        results.push({
          recipientId: recipient.id,
          email: recipient.email,
          status: 'unsubscribed',
        });
      } else {
        await updateRecipientStatus(recipient.id, 'sent');
        sentCount++;
        results.push({
          recipientId: recipient.id,
          email: recipient.email,
          status: 'sent',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { campaignId, recipientId: recipient.id, email: recipient.email, error: message },
        'Failed to send newsletter to recipient',
      );

      try {
        await updateRecipientStatus(recipient.id, 'failed', message);
      } catch (updateErr) {
        logger.error(
          { campaignId, recipientId: recipient.id, error: updateErr },
          'Failed to update recipient status',
        );
      }

      failedCount++;
      results.push({
        recipientId: recipient.id,
        email: recipient.email,
        status: 'failed',
        error: message,
      });
    }

    if ((i + 1) % 50 === 0 || i + 1 === total) {
      logger.info(
        { campaignId, processed: i + 1, total, sentCount, failedCount, unsubscribedCount },
        'Newsletter campaign progress',
      );
    }
  }

  const finalStatus = failedCount === total ? 'failed' : 'completed';
  await updateCampaignStatus(campaignId, finalStatus, total);

  logger.info(
    {
      campaignId,
      total,
      sentCount,
      failedCount,
      unsubscribedCount,
      status: finalStatus,
    },
    'Newsletter campaign send finished',
  );

  return results;
}

async function main() {
  try {
    await run();
  } catch (err) {
    logger.error({ error: err }, 'Newsletter campaign send failed');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

export { run };