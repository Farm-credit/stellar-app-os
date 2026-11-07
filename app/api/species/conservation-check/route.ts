/**
 * POST /api/species/conservation-check — Issue #1657
 *
 * Quarterly IUCN Red List check for every catalogue species. Creates one
 * conservation alert per sponsor holding trees of a species that was newly
 * listed or upgraded to a threatened category, and emails each sponsor the
 * conservation context plus a link to the species education page.
 *
 * Intended to be invoked on a schedule (platform cron / GitHub Actions
 * quarterly workflow); safe to re-run because alerts are deduped per
 * (species, sponsor, category, quarter).
 *
 * Protected by `Authorization: Bearer <SPECIES_CONSERVATION_CRON_SECRET>`.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { runConservationCheck } from '@/lib/species/conservation-checker';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = process.env.SPECIES_CONSERVATION_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'SPECIES_CONSERVATION_CRON_SECRET is not configured' },
      { status: 503 }
    );
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runConservationCheck(getPool());
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Conservation check failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
