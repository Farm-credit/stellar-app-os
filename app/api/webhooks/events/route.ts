import { NextRequest, NextResponse } from 'next/server';
import { mockWebhookEvents } from '@/lib/api/mock/webhookEvents';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const eventType = searchParams.get('eventType');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    let events = [...mockWebhookEvents];

    // Filter by status
    if (status && status !== 'all') {
      events = events.filter((event) => event.status === status);
    }

    // Filter by event type
    if (eventType && eventType !== 'all') {
      events = events.filter((event) => event.eventType === eventType);
    }

    // Limit results
    events = events.slice(0, limit);

    return NextResponse.json(
      {
        events,
        total: events.length,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Webhook events fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch webhook events',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
