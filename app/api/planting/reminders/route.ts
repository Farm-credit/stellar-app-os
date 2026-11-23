/**
 * POST /api/planting/reminders
 *
 * Queues planting reminders for sponsors whose trees are in a batch scheduled
 * within the reminder window. Intended to be invoked on a schedule (platform
 * cron), e.g. hourly; each sponsor/event pair is reminded once.
 *
 * Protected by `Authorization: Bearer <PLANTING_REMINDER_CRON_SECRET>`.
 *
 * Closes #1659
 */

import { type NextRequest, NextResponse } from 'next/server';
import { sendPlantingReminders } from '@/lib/plantingSchedule';
import { MOCK_BATCH_SPONSORSHIPS, MOCK_PLANTING_EVENTS } from '@/lib/treePlantingStreams';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = process.env.PLANTING_REMINDER_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'PLANTING_REMINDER_CRON_SECRET is not configured' },
      { status: 503 }
    );
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const reminded = sendPlantingReminders(MOCK_PLANTING_EVENTS, MOCK_BATCH_SPONSORSHIPS);
  return NextResponse.json({ reminded: reminded.length, details: reminded });
}
