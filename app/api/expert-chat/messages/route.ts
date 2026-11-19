import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const VALID_TOPICS = [
  'carbon_farming',
  'soil_health',
  'certification',
  'market_prices',
  'general',
] as const;

type Topic = (typeof VALID_TOPICS)[number];

interface ChatMessageRow {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_id: string | null;
  content: string;
  created_at: string;
}

interface ChatConversationRow {
  id: string;
  farmer_id: string;
  expert_id: string | null;
  topic: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function getFarmerId(req: NextRequest): string | null {
  const headerId = req.headers.get('x-user-id');
  if (headerId && headerId.trim().length > 0) {
    return headerId.trim();
  }
  return null;
}

function isValidTopic(topic: unknown): topic is Topic {
  return typeof topic === 'string' && (VALID_TOPICS as readonly string[]).includes(topic);
}

export async function GET(req: NextRequest) {
  const farmerId = getFarmerId(req);
  if (!farmerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    return NextResponse.json(
      { error: 'conversationId is required' },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    const convResult = await client.query<ChatConversationRow>(
      'SELECT id, farmer_id, expert_id, topic, status, created_at, updated_at FROM chat_conversations WHERE id = $1',
      [conversationId]
    );

    if (convResult.rowCount === 0) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const conversation = convResult.rows[0];
    if (conversation.farmer_id !== farmerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const messagesResult = await client.query<ChatMessageRow>(
      'SELECT id, conversation_id, sender_type, sender_id, content, created_at FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        farmerId: conversation.farmer_id,
        expertId: conversation.expert_id,
        topic: conversation.topic,
        status: conversation.status,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
      },
      messages: messagesResult.rows.map((m) => ({
        id: m.id,
        conversationId: m.conversation_id,
        senderType: m.sender_type,
        senderId: m.sender_id,
        content: m.content,
        createdAt: m.created_at,
      })),
    });
  } catch (err) {
    console.error('Failed to fetch chat messages:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const farmerId = getFarmerId(req);
  if (!farmerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { conversationId, content, topic } = body as {
    conversationId?: unknown;
    content?: unknown;
    topic?: unknown;
  };

  if (typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  if (content.length > 5000) {
    return NextResponse.json({ error: 'content is too long' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let convId: string;

    if (conversationId !== undefined && conversationId !== null) {
      if (typeof conversationId !== 'string') {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Invalid conversationId' }, { status: 400 });
      }

      const convResult = await client.query<ChatConversationRow>(
        'SELECT id, farmer_id, expert_id, topic, status, created_at, updated_at FROM chat_conversations WHERE id = $1',
        [conversationId]
      );

      if (convResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }

      const conversation = convResult.rows[0];
      if (conversation.farmer_id !== farmerId) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      if (conversation.status === 'closed') {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Conversation is closed' }, { status: 409 });
      }

      convId = conversation.id;
    } else {
      if (!isValidTopic(topic)) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: `topic must be one of: ${VALID_TOPICS.join(', ')}` },
          { status: 400 }
        );
      }

      const newConv = await client.query<ChatConversationRow>(
        `INSERT INTO chat_conversations (farmer_id, expert_id, topic, status, created_at, updated_at)
         VALUES ($1, NULL, $2, 'open', NOW(), NOW())
         RETURNING id, farmer_id, expert_id, topic, status, created_at, updated_at`,
        [farmerId, topic]
      );
      convId = newConv.rows[0].id;
    }

    const inserted = await client.query<ChatMessageRow>(
      `INSERT INTO chat_messages (conversation_id, sender_type, sender_id, content, created_at)
       VALUES ($1, 'farmer', $2, $3, NOW())
       RETURNING id, conversation_id, sender_type, sender_id, content, created_at`,
      [convId, farmerId, content.trim()]
    );

    await client.query(
      'UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1',
      [convId]
    );

    await client.query('COMMIT');

    const m = inserted.rows[0];
    return NextResponse.json(
      {
        message: {
          id: m.id,
          conversationId: m.conversation_id,
          senderType: m.sender_type,
          senderId: m.sender_id,
          content: m.content,
          createdAt: m.created_at,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    console.error('Failed to post chat message:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    client.release();
  }
}