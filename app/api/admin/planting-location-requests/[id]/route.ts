import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import {
  getAvailablePlantingZones,
  getLocationRequestById,
  matchLocationRequestSchema,
  notifySponsorOfLocationDecision,
  resolveLocationRequest,
} from '@/lib/planting-location-requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/planting-location-requests/[id]
 *
 * Matches a sponsor's planting location request to an available planting zone
 * (either confirming the preferred location or assigning an alternative zone)
 * and notifies the sponsor of the outcome.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const isAdmin = await isAdminRequest();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const existing = await getLocationRequestById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Location request not found' }, { status: 404 });
    }

    const body: unknown = await request.json();
    const parsed = matchLocationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid zone assignment payload',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { locationId, resolution, adminNotes, reviewedBy } = parsed.data;
    const availableZones = await getAvailablePlantingZones();
    const matchedZone = availableZones.find((zone) => zone.id === locationId);

    if (!matchedZone) {
      return NextResponse.json(
        { error: `Planting zone ${locationId} was not found or has no available capacity.` },
        { status: 404 }
      );
    }

    if (matchedZone.availableCapacity < existing.treeCount) {
      return NextResponse.json(
        {
          error: `Planting zone "${matchedZone.name}" only has capacity for ${matchedZone.availableCapacity} trees (${existing.treeCount} requested).`,
        },
        { status: 409 }
      );
    }

    const notification = await notifySponsorOfLocationDecision({
      request: existing,
      assignedZoneName: matchedZone.name,
      assignedRegion: matchedZone.region,
      resolution,
      adminNotes,
    });

    const updated = await resolveLocationRequest({
      id: existing.id,
      location: matchedZone,
      resolution,
      adminNotes,
      reviewedBy,
      notifiedAt: notification.sentAt,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update location request' }, { status: 500 });
    }

    return NextResponse.json({
      request: updated,
      notification,
      message:
        resolution === 'confirmed'
          ? `Confirmed "${matchedZone.name}" for ${existing.sponsorEmail} and notified sponsor.`
          : `Assigned alternative zone "${matchedZone.name}" for ${existing.sponsorEmail} and notified sponsor.`,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Malformed JSON request body' }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : 'Failed to match planting location request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
