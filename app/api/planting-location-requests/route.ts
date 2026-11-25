import { NextResponse } from 'next/server';
import {
  createLocationRequest,
  createLocationRequestSchema,
  listLocationRequests,
} from '@/lib/planting-location-requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/planting-location-requests?email=...&transactionRef=...
 *
 * Allows a sponsor to look up their submitted planting location requests
 * by email or checkout transaction reference.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email')?.trim() || undefined;
    const transactionRef = searchParams.get('transactionRef')?.trim() || undefined;

    if (!email && !transactionRef) {
      return NextResponse.json(
        { error: 'Provide either an email or transactionRef query parameter.' },
        { status: 400 }
      );
    }

    const requests = await listLocationRequests({ email, transactionRef });
    return NextResponse.json({
      requests,
      totalCount: requests.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch planting location requests';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/planting-location-requests
 *
 * Submits a sponsor's preferred geographic region or country at checkout,
 * subject to project availability.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = createLocationRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid planting location request',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const created = await createLocationRequest(parsed.data);

    return NextResponse.json(
      {
        request: created,
        message:
          'Your preferred planting location has been submitted. We will notify you once an admin confirms a matching zone or assigns an alternative.',
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Malformed JSON request body' }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : 'Failed to submit planting location request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
