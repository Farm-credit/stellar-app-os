import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import sgMail from '@sendgrid/mail';
import { isEmailConfigured } from '@/lib/email/sendgrid';

export interface Briefing {
  id: string;
  email: string;
  name: string;
  role: string;
  title: string;
  location: string;
  briefing: string;
  starts_at: string;
  ends_at: string;
}

export async function sendBriefing(row: Briefing) {
  if (!isEmailConfigured()) throw new Error('SENDGRID_API_KEY is required');
  // Plain text keeps coordinator-supplied logistics out of HTML and link markup.
  await sgMail.send({
    to: row.email,
    from: process.env.SENDGRID_FROM_EMAIL ?? 'no-reply@harvesta.app',
    subject: `Planting briefing: ${row.title.replace(/[\r\n]/g, ' ')}`,
    text: `Hi ${row.name},\n\nYour role: ${row.role}\nEvent: ${row.title}\nLocation: ${row.location}\nStarts: ${new Date(row.starts_at).toISOString()}\nEnds: ${new Date(row.ends_at).toISOString()}\nTimes above are UTC.\n\n${row.briefing}\n\nThank you for volunteering!`,
  });
}

export async function processBriefings(
  pool: Pool,
  send: (briefing: Briefing) => Promise<unknown> = sendBriefing,
  batchSize = 20
) {
  // Do not claim work when delivery is unconfigured; pending messages remain retryable.
  if (send === sendBriefing && !isEmailConfigured())
    throw new Error('SENDGRID_API_KEY is required');
  const lease = randomUUID();
  const result = await pool.query<Briefing>(
    `WITH due AS (
       SELECT v.id FROM planting_event_volunteers v JOIN planting_events e ON e.id = v.event_id
       WHERE v.briefing_sent_at IS NULL AND v.briefing_attempts < 5
         AND v.briefing_retry_at <= now()
         AND e.starts_at > now() AND e.starts_at <= now() + interval '24 hours'
       ORDER BY e.starts_at, v.id LIMIT $1 FOR UPDATE OF v SKIP LOCKED
     ), claimed AS (
       UPDATE planting_event_volunteers v SET briefing_lease = $2,
         briefing_retry_at = now() + interval '15 minutes', briefing_attempts = briefing_attempts + 1
       FROM due WHERE v.id = due.id RETURNING v.*
     )
     SELECT c.id, c.email, c.name, c.role, e.title, e.location, e.briefing, e.starts_at, e.ends_at
     FROM claimed c JOIN planting_events e ON e.id = c.event_id`,
    [Math.max(1, Math.min(batchSize, 20)), lease]
  );
  let sent = 0;
  let failed = 0;
  // Parallel bounded batch avoids leases expiring while queued sends wait behind one another.
  await Promise.all(
    result.rows.map(async (row) => {
      try {
        if (new Date(row.starts_at).getTime() <= Date.now()) return;
        await send(row);
        await pool.query(
          `UPDATE planting_event_volunteers SET briefing_sent_at = now(), briefing_lease = NULL
         WHERE id = $1 AND briefing_lease = $2`,
          [row.id, lease]
        );
        sent++;
      } catch {
        await pool.query(
          `UPDATE planting_event_volunteers SET briefing_lease = NULL,
         briefing_retry_at = now() + interval '5 minutes' WHERE id = $1 AND briefing_lease = $2`,
          [row.id, lease]
        );
        failed++;
      }
    })
  );
  return { sent, failed };
}
