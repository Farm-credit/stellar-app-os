import { NextResponse } from 'next/server';
import { addMember, getCooperative, removeMember } from '@/lib/api/cooperatives';
import {
  cooperativeErrorResponse,
  invalidJsonResponse,
  readJsonBody,
} from '@/lib/api/cooperatives-http';
import type { AddMemberInput } from '@/lib/types/cooperative';

export const runtime = 'nodejs';

/**
 * GET /api/cooperatives/:id/members
 *
 * Lists the cooperative's members and their pooled contributions.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cooperative = getCooperative(id);
    return NextResponse.json({
      success: true,
      memberCount: cooperative.members.length,
      members: cooperative.members,
    });
  } catch (error) {
    return cooperativeErrorResponse(error);
  }
}

/**
 * POST /api/cooperatives/:id/members
 *
 * Invites/adds a farmer to the cooperative.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJsonBody<AddMemberInput>(request);
    if (!body) return invalidJsonResponse();

    const cooperative = addMember(id, body);
    return NextResponse.json(
      {
        success: true,
        member: cooperative.members.find((member) => member.userId === body.userId?.trim()),
        memberCount: cooperative.members.length,
        cooperative,
      },
      { status: 201 }
    );
  } catch (error) {
    return cooperativeErrorResponse(error);
  }
}

/**
 * DELETE /api/cooperatives/:id/members?memberId=… (or `{ "memberId": "…" }`)
 *
 * Removes a member. The founder cannot be removed and members with pooled
 * contributions must withdraw those projects first.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    let memberId = searchParams.get('memberId') ?? undefined;
    if (!memberId) {
      const body = await readJsonBody<{ memberId?: string }>(request);
      memberId = body?.memberId;
    }
    if (!memberId) {
      return NextResponse.json({ success: false, error: 'memberId is required' }, { status: 400 });
    }

    const cooperative = removeMember(id, memberId);
    return NextResponse.json({ success: true, cooperative });
  } catch (error) {
    return cooperativeErrorResponse(error);
  }
}
