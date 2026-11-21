import { NextResponse } from 'next/server';
import { createConversation, listConversations } from '@/lib/api/messaging';
import {
  invalidJsonResponse,
  messagingErrorResponse,
  readJsonBody,
} from '@/lib/api/messaging-http';
import type {
  ConversationParticipantRole,
  ConversationStatus,
  CreateConversationInput,
} from '@/lib/types/messaging';

export const runtime = 'nodejs';

/**
 * GET /api/messages?userId=...
 *
 * Lists the conversations a user participates in (their inbox), newest
 * activity first. Supports `role`, `status`, `projectId`, `search` and
 * `unreadOnly` filters.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = (searchParams.get('userId') ?? '').trim();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId query parameter is required' },
        { status: 400 }
      );
    }

    const conversations = listConversations({
      userId,
      role: (searchParams.get('role') as ConversationParticipantRole | null) ?? undefined,
      status: (searchParams.get('status') as ConversationStatus | null) ?? undefined,
      projectId: searchParams.get('projectId') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      unreadOnly: searchParams.get('unreadOnly') === 'true',
    });

    return NextResponse.json({
      success: true,
      totalCount: conversations.length,
      conversations,
    });
  } catch (error) {
    return messagingErrorResponse(error);
  }
}

/**
 * POST /api/messages
 *
 * Opens a direct conversation between a farmer and a buyer, optionally with an
 * opening message and/or a structured offer. The initiator must be one of the
 * two participants.
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CreateConversationInput>(request);
    if (!body) return invalidJsonResponse();

    const conversation = createConversation(body);
    return NextResponse.json({ success: true, conversation }, { status: 201 });
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
