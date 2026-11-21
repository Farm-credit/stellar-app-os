import { NextResponse } from 'next/server';
import { listMessages, sendMessage } from '@/lib/api/messaging';
import {
  invalidJsonResponse,
  messagingErrorResponse,
  readJsonBody,
} from '@/lib/api/messaging-http';
import type { SendMessageInput } from '@/lib/types/messaging';

export const runtime = 'nodejs';

/**
 * GET /api/messages/:conversationId/messages?userId=...&limit=...
 *
 * Returns the thread's messages, oldest first. `limit` returns only the most
 * recent N. The caller must be a participant.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const userId = (searchParams.get('userId') ?? '').trim();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId query parameter is required' },
        { status: 400 }
      );
    }

    const limitParam = searchParams.get('limit');
    const messages = listMessages(conversationId, {
      viewerId: userId,
      limit: limitParam === null ? undefined : Number(limitParam),
    });

    return NextResponse.json({
      success: true,
      totalCount: messages.length,
      messages,
    });
  } catch (error) {
    return messagingErrorResponse(error);
  }
}

/**
 * POST /api/messages/:conversationId/messages
 *
 * Sends a message. When `terms` are supplied the message is recorded as a
 * structured offer (or counter-offer) instead of plain text.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const body = await readJsonBody<SendMessageInput>(request);
    if (!body) return invalidJsonResponse();

    const message = sendMessage(conversationId, body);
    return NextResponse.json({ success: true, message }, { status: 201 });
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
