import { NextResponse } from 'next/server';
import { closeConversation, getConversation, markConversationRead } from '@/lib/api/messaging';
import {
  invalidJsonResponse,
  messagingErrorResponse,
  readJsonBody,
} from '@/lib/api/messaging-http';

export const runtime = 'nodejs';

interface ConversationPatchBody {
  /** Participant performing the action. */
  userId?: string;
  action?: 'mark_read' | 'close';
}

/**
 * GET /api/messages/:conversationId?userId=...
 *
 * Full conversation detail: participants, messages, proposals and current
 * terms. The caller must be a participant.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = (searchParams.get('userId') ?? '').trim();

    const conversation = getConversation(conversationId, userId || undefined);
    return NextResponse.json({ success: true, conversation });
  } catch (error) {
    return messagingErrorResponse(error);
  }
}

/**
 * PATCH /api/messages/:conversationId
 *
 * Participant actions on the thread:
 *  - `mark_read` → marks every message as read for `userId`
 *  - `close`     → closes the thread (read-only afterwards)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const body = await readJsonBody<ConversationPatchBody>(request);
    if (!body) return invalidJsonResponse();

    switch (body.action) {
      case 'mark_read': {
        const conversation = markConversationRead(conversationId, body.userId ?? '');
        return NextResponse.json({ success: true, conversation });
      }
      case 'close': {
        const conversation = closeConversation(conversationId, body.userId ?? '');
        return NextResponse.json({ success: true, conversation });
      }
      default:
        return NextResponse.json(
          { success: false, error: 'action must be one of: mark_read, close' },
          { status: 400 }
        );
    }
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
