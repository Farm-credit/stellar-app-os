import type { Pool, PoolClient } from 'pg';
import {
  sendSegmentedNewsletter,
  type SponsorSegment,
  type NewsletterRecipient,
  isEmailConfigured,
} from '@/lib/email/sendgrid';

export const SPONSOR_SEGMENTS = ['first-time', 'vip', 'lapsed', 'regional'] as const;
export type SponsorSegmentName = (typeof SPONSOR_SEGMENTS)[number];

export interface NewsletterInput {
  subject: string;
  message: string;
  segments: SponsorSegmentName[];
  region?: string;
}

export interface NewsletterCampaign {
  id: string;
  subject: string;
  message: string;
  segments: SponsorSegmentName[];
  region: string | null;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
}

type SponsorRow = {
  email: string;
  name: string;
  region: string | null;
  tree_count: number;
  last_activity: Date;
};

function normalizeSegments(segments: readonly string[]): SponsorSegmentName[] {
  const unique = [...new Set(segments)].filter((segment): segment is SponsorSegmentName =>
    (SPONSOR_SEGMENTS as readonly string[]).includes(segment)
  );
  if (unique.length === 0) throw new Error('At least one valid sponsor segment is required');
  return unique;
}

/** Resolve recipients from durable sponsorship activity without exposing wallet data. */
export async function resolveSponsorRecipients(
  pool: Pick<Pool, 'query'>,
  segments: readonly string[],
  region?: string
): Promise<NewsletterRecipient[]> {
  const normalized = normalizeSegments(segments);
  const { rows } = await pool.query<SponsorRow>(
    `WITH activity AS (
       SELECT lower(trim(sponsor_email)) AS email,
              max(NULLIF(trim(sponsor_name), '')) AS name,
              max(NULLIF(trim(region), '')) AS region,
              count(*)::int AS tree_count,
              max(created_at) AS last_activity
       FROM planting_waitlist
       WHERE sponsor_email IS NOT NULL AND trim(sponsor_email) <> ''
       GROUP BY lower(trim(sponsor_email))
       UNION ALL
       SELECT lower(trim(email)) AS email,
              'Sponsor' AS name,
              NULL AS region,
              0 AS tree_count,
              max(COALESCE(last_billing_date, created_at)) AS last_activity
       FROM sponsorship_subscriptions
       WHERE email IS NOT NULL AND trim(email) <> ''
       GROUP BY lower(trim(email))
     ), sponsors AS (
       SELECT email, max(name) AS name, max(region) AS region,
              sum(tree_count)::int AS tree_count, max(last_activity) AS last_activity
       FROM activity GROUP BY email
     )
     SELECT email, COALESCE(name, 'Sponsor') AS name, region, tree_count, last_activity
     FROM sponsors
     WHERE ($1::text[] && ARRAY[
       CASE WHEN tree_count = 1 THEN 'first-time' END,
       CASE WHEN tree_count >= 5 THEN 'vip' END,
       CASE WHEN last_activity < now() - interval '90 days' THEN 'lapsed' END,
       CASE WHEN $2::text IS NOT NULL AND region = $2 THEN 'regional' END
     ]::text[])
       AND ($2::text IS NULL OR 'regional' <> ALL($1::text[]) OR region = $2)
     ORDER BY email`,
    [normalized, region ?? null]
  );
  return rows.map((row) => ({
    email: row.email,
    name: row.name || 'Sponsor',
    region: row.region ?? undefined,
    segment:
      normalized.find((segment) =>
        segment === 'first-time'
          ? row.tree_count === 1
          : segment === 'vip'
            ? row.tree_count >= 5
            : segment === 'lapsed'
              ? row.last_activity < new Date(Date.now() - 90 * 86400000)
              : Boolean(region && row.region === region)
      ) ?? normalized[0],
  }));
}

export async function queueNewsletter(
  pool: Pool,
  input: NewsletterInput
): Promise<NewsletterCampaign> {
  if (!input.subject.trim() || !input.message.trim())
    throw new Error('subject and message are required');
  const segments = normalizeSegments(input.segments);
  const recipients = await resolveSponsorRecipients(pool, segments, input.region);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const campaignResult = await client.query(
      `INSERT INTO newsletter_campaigns (subject, message, segments, region, recipient_count)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       RETURNING id, subject, message, segments, region, status, recipient_count, sent_count, failed_count`,
      [
        input.subject.trim(),
        input.message.trim(),
        JSON.stringify(segments),
        input.region ?? null,
        recipients.length,
      ]
    );
    const campaign = campaignResult.rows[0];
    for (const recipient of recipients) {
      await client.query(
        `INSERT INTO newsletter_deliveries (campaign_id, email, name, segment, region)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (campaign_id, email) DO NOTHING`,
        [campaign.id, recipient.email, recipient.name, recipient.segment, recipient.region ?? null]
      );
    }
    await client.query('COMMIT');
    return mapCampaign(campaign);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function sendNewsletterBatch(
  pool: Pool,
  campaignId: string,
  batchSize = 50
): Promise<{ sent: number; failed: number; pending: number }> {
  if (!isEmailConfigured()) throw new Error('SENDGRID_API_KEY is required to send newsletters');
  const client: PoolClient = await pool.connect();
  let sent = 0;
  let failed = 0;
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE newsletter_campaigns SET status = 'sending', started_at = COALESCE(started_at, now()) WHERE id = $1`,
      [campaignId]
    );
    const result = await client.query(
      `SELECT id, email, name, segment, region FROM newsletter_deliveries
       WHERE campaign_id = $1 AND status = 'pending' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT $2`,
      [campaignId, Math.max(1, Math.min(batchSize, 200))]
    );
    await client.query('COMMIT');
    for (const row of result.rows) {
      try {
        await sendSegmentedNewsletter({
          subject: (
            await pool.query<{ subject: string }>(
              'SELECT subject FROM newsletter_campaigns WHERE id = $1',
              [campaignId]
            )
          ).rows[0].subject,
          message: (
            await pool.query<{ message: string }>(
              'SELECT message FROM newsletter_campaigns WHERE id = $1',
              [campaignId]
            )
          ).rows[0].message,
          recipients: [
            {
              email: row.email,
              name: row.name,
              segment: row.segment as SponsorSegment,
              region: row.region ?? undefined,
            },
          ],
        });
        await pool.query(
          `UPDATE newsletter_deliveries SET status = 'sent', attempts = attempts + 1, sent_at = now() WHERE id = $1`,
          [row.id]
        );
        sent++;
      } catch (error) {
        await pool.query(
          `UPDATE newsletter_deliveries SET status = 'failed', attempts = attempts + 1, last_error = $2 WHERE id = $1`,
          [row.id, error instanceof Error ? error.message : String(error)]
        );
        failed++;
      }
    }
    const summary = await pool.query<{ pending: string; sent: string; failed: string }>(
      `SELECT count(*) FILTER (WHERE status = 'pending') AS pending, count(*) FILTER (WHERE status = 'sent') AS sent, count(*) FILTER (WHERE status = 'failed') AS failed FROM newsletter_deliveries WHERE campaign_id = $1`,
      [campaignId]
    );
    const counts = summary.rows[0];
    await pool.query(
      `UPDATE newsletter_campaigns SET status = CASE WHEN $2::int = 0 THEN 'sent' ELSE 'sending' END, sent_count = $3, failed_count = $4, completed_at = CASE WHEN $2::int = 0 THEN now() ELSE completed_at END WHERE id = $1`,
      [campaignId, Number(counts.pending), Number(counts.sent), Number(counts.failed)]
    );
    return { sent, failed, pending: Number(counts.pending) };
  } finally {
    client.release();
  }
}

function mapCampaign(row: Record<string, unknown>): NewsletterCampaign {
  return {
    id: String(row.id),
    subject: String(row.subject),
    message: String(row.message),
    segments: (row.segments as SponsorSegmentName[]) ?? [],
    region: (row.region as string | null) ?? null,
    status: String(row.status),
    recipientCount: Number(row.recipient_count),
    sentCount: Number(row.sent_count),
    failedCount: Number(row.failed_count),
  };
}
