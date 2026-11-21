import { NextResponse } from 'next/server';
import { getDealState, handleDealAction } from '@/lib/api/messaging';
import {
  invalidJsonResponse,
  messagingErrorResponse,
  readJsonBody,
} from '@/lib/api/messaging-http';
import type { DealActionInput } from '@/lib/types/messaging';

export const runtime = 'nodejs';

/**
 * GET /api/messages/:conversationId/deal?userId=...
 *
 * Current negotiation state: every proposal, the pending one, and the current
 * and agreed terms.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = (searchParams.get('userId') ?? '').trim();

    const deal = getDealState(conversationId, userId || undefined);
    return NextResponse.json({ success: true, deal });
  } catch (error) {
    return messagingErrorResponse(error);
  }
}

/**
 * POST /api/messages/:conversationId/deal
 *
 * Action-dispatched negotiation endpoint:
 *  - `propose` → puts new terms on the table
 *  - `counter` → supersedes the pending offer with a revised one
 *  - `accept`  → the other party accepts the pending offer
 *  - `reject`  → the other party declines the pending offer
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const body = await readJsonBody<DealActionInput>(request);
    if (!body) return invalidJsonResponse();

    const conversation = handleDealAction(conversationId, body);
    return NextResponse.json({
      success: true,
      conversation,
      deal: getDealState(conversationId),
    });
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
