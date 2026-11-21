import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { eventSchema } from '@/lib/volunteers/schema';
import { createEvent, listEvents } from '@/lib/volunteers/service';
import { volunteerWallet, volunteerResponse } from '@/lib/volunteers/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json({ events: await listEvents(getPool()) });
  } catch (error) {
    return volunteerResponse(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const wallet = await volunteerWallet(request);
    const input = eventSchema.parse(await request.json());
    return NextResponse.json(
      { event: await createEvent(getPool(), wallet, input) },
      { status: 201 }
    );
  } catch (error) {
    return volunteerResponse(error);
  }
}
