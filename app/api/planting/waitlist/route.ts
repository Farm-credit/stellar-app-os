import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { sendWaitlistNotificationEmail } from '@/lib/email/sendgrid';

/**
 * POST /api/planting/waitlist
 *
 * Called when a sponsor tries to create a planting job but no planter
 * is available in the requested region. Queues the job and notifies
 * the sponsor with an estimated wait time.
 *
 * Body: { treeId, species, region, sponsorEmail, sponsorName }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      treeId?: string;
      species?: string;
      region?: string;
      sponsorEmail?: string;
      sponsorName?: string;
    };

    const { treeId, species, region, sponsorEmail, sponsorName } = body;

    if (!treeId || !species || !region || !sponsorEmail || !sponsorName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const pool = getPool();

    // Count existing waitlist entries for this region to estimate wait time.
    // Assume ~3 days per position ahead in the queue.
    const { rows: queueRows } = await pool.query<{ queue_depth: string }>(
      `SELECT COUNT(*) AS queue_depth
       FROM planting_waitlist
       WHERE region = $1 AND status = 'waiting'`,
      [region]
    );
    const queueDepth = parseInt(queueRows[0]?.queue_depth ?? '0', 10);
    const estimatedWaitDays = Math.max(3, (queueDepth + 1) * 3);

    // Insert into waitlist.
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO planting_waitlist
         (sponsor_email, sponsor_name, tree_id, species, region, estimated_wait_days)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [sponsorEmail, sponsorName, treeId, species, region, estimatedWaitDays]
    );

    const waitlistId = rows[0].id;

    await sendWaitlistNotificationEmail({
      sponsorEmail,
      sponsorName,
      treeId,
      species,
      region,
      estimatedWaitDays,
      waitlistId,
    });

    return NextResponse.json(
      {
        waitlistId,
        estimatedWaitDays,
        message: `No planters available in ${region} right now. Added to waitlist (est. ${estimatedWaitDays} days).`,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('[planting/waitlist] POST error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
