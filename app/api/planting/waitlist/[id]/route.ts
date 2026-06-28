import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';

interface WaitlistRow {
  id: string;
  sponsor_email: string;
  sponsor_name: string;
  tree_id: string;
  species: string;
  region: string;
  status: 'waiting' | 'assigned' | 'cancelled';
  estimated_wait_days: number | null;
  assigned_planter_id: string | null;
  assigned_at: string | null;
  created_at: string;
}

/**
 * GET /api/planting/waitlist/[id]
 *
 * Returns the current status of a waitlist entry — useful for sponsors
 * to check their position and updated estimated wait time.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'Missing waitlist id' }, { status: 400 });
  }

  try {
    const pool = getPool();

    const { rows } = await pool.query<WaitlistRow>(
      `SELECT id, sponsor_email, sponsor_name, tree_id, species, region,
              status, estimated_wait_days, assigned_planter_id, assigned_at, created_at
       FROM planting_waitlist
       WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Waitlist entry not found' }, { status: 404 });
    }

    const entry = rows[0];

    // Count how many jobs are ahead of this one in the same region.
    const { rows: posRows } = await pool.query<{ position: string }>(
      `SELECT COUNT(*) AS position
       FROM planting_waitlist
       WHERE region = $1 AND status = 'waiting' AND created_at < $2`,
      [entry.region, entry.created_at]
    );
    const queuePosition = parseInt(posRows[0]?.position ?? '0', 10) + 1;

    return NextResponse.json({
      waitlistId: entry.id,
      treeId: entry.tree_id,
      species: entry.species,
      region: entry.region,
      status: entry.status,
      queuePosition: entry.status === 'waiting' ? queuePosition : null,
      estimatedWaitDays: entry.estimated_wait_days,
      assignedPlanterId: entry.assigned_planter_id,
      assignedAt: entry.assigned_at,
      createdAt: entry.created_at,
    });
  } catch (error) {
    console.error('[planting/waitlist/:id] GET error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
