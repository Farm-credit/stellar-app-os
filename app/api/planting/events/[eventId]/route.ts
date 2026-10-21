import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { eventIdSchema, signupSchema, updateSchema } from '@/lib/volunteers/schema';
import { getEvent, signup, updateVolunteer } from '@/lib/volunteers/service';
import { volunteerWallet, volunteerResponse } from '@/lib/volunteers/auth';

export const runtime = 'nodejs';
type Context = { params: Promise<{ eventId: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const wallet = await volunteerWallet(request);
    const id = eventIdSchema.parse((await context.params).eventId);
    return NextResponse.json(await getEvent(getPool(), id, wallet));
  } catch (error) {
    return volunteerResponse(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const wallet = await volunteerWallet(request);
    const id = eventIdSchema.parse((await context.params).eventId);
    const input = signupSchema.parse(await request.json());
    return NextResponse.json(
      { volunteer: await signup(getPool(), id, wallet, input) },
      { status: 201 }
    );
  } catch (error) {
    return volunteerResponse(error);
  }
}
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const wallet = await volunteerWallet(request);
    const id = eventIdSchema.parse((await context.params).eventId);
    const input = updateSchema.parse(await request.json());
    await updateVolunteer(getPool(), id, wallet, input);
    return NextResponse.json({ success: true });
  } catch (error) {
    return volunteerResponse(error);
  }
}
