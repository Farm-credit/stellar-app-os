# Webhook Event Logs Viewer - Integration Examples

## 🔗 Adding to Admin Navigation

### Option 1: Update Admin Layout
If you have an admin layout component:

```tsx
// app/admin/layout.tsx
import Link from 'next/link';

export default function AdminLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-muted border-r">
        <nav className="p-4 space-y-2">
          <Link 
            href="/admin/projects"
            className="block px-4 py-2 rounded hover:bg-accent"
          >
            Projects
          </Link>
          <Link 
            href="/admin/webhooks"
            className="block px-4 py-2 rounded hover:bg-accent"
          >
            Webhook Logs
          </Link>
          {/* Other admin links */}
        </nav>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

### Option 2: Add to Existing Navigation
```tsx
// components/organisms/AdminNav.tsx
const adminNavItems = [
  { href: '/admin/projects', label: 'Projects', icon: FolderIcon },
  { href: '/admin/webhooks', label: 'Webhook Logs', icon: WebhookIcon },
  { href: '/admin/users', label: 'Users', icon: UsersIcon },
];
```

---

## 🔌 Connecting to Real Database

### Step 1: Create Database Schema

```sql
-- PostgreSQL example
CREATE TABLE webhook_events (
  id VARCHAR(50) PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  event_type VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL,
  endpoint TEXT NOT NULL,
  http_status INTEGER,
  payload JSONB NOT NULL,
  response TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_timestamp ON webhook_events(timestamp DESC);
```

### Step 2: Create Database Service

```typescript
// lib/db/webhookEvents.ts
import { db } from '@/lib/db';
import type { WebhookEvent } from '@/lib/types/webhook';

export async function getWebhookEvents(filters?: {
  status?: string;
  eventType?: string;
  limit?: number;
}): Promise<WebhookEvent[]> {
  let query = db.webhookEvents.findMany({
    orderBy: { timestamp: 'desc' },
  });

  if (filters?.status && filters.status !== 'all') {
    query = query.where({ status: filters.status });
  }

  if (filters?.eventType && filters.eventType !== 'all') {
    query = query.where({ eventType: filters.eventType });
  }

  if (filters?.limit) {
    query = query.take(filters.limit);
  }

  return await query;
}

export async function retryWebhookEvent(eventId: string): Promise<void> {
  const event = await db.webhookEvents.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  if (event.retryCount >= event.maxRetries) {
    throw new Error('Max retries exceeded');
  }

  // Send webhook
  const response = await fetch(event.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event.payload),
  });

  // Update event
  await db.webhookEvents.update({
    where: { id: eventId },
    data: {
      status: response.ok ? 'success' : 'failed',
      httpStatus: response.status,
      response: await response.text(),
      retryCount: event.retryCount + 1,
      updatedAt: new Date(),
    },
  });
}
```

### Step 3: Update API Routes

```typescript
// app/api/webhooks/events/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getWebhookEvents } from '@/lib/db/webhookEvents';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    const events = await getWebhookEvents({
      status: searchParams.get('status') || undefined,
      eventType: searchParams.get('eventType') || undefined,
      limit: parseInt(searchParams.get('limit') || '100', 10),
    });

    return NextResponse.json({
      events,
      total: events.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to fetch webhook events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
```

```typescript
// app/api/webhooks/retry/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { retryWebhookEvent } from '@/lib/db/webhookEvents';

export async function POST(request: NextRequest) {
  try {
    const { eventId } = await request.json();

    if (!eventId) {
      return NextResponse.json(
        { error: 'Event ID is required' },
        { status: 400 }
      );
    }

    await retryWebhookEvent(eventId);

    return NextResponse.json({
      success: true,
      eventId,
      message: 'Webhook retry initiated',
    });
  } catch (error) {
    console.error('Webhook retry failed:', error);
    return NextResponse.json(
      { 
        error: 'Retry failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
```

### Step 4: Update Page to Fetch Real Data

```typescript
// app/admin/webhooks/page.tsx
import type { ReactNode } from 'react';
import { Text } from '@/components/atoms/Text';
import { WebhookEventLogsViewer } from '@/components/organisms/WebhookEventLogsViewer';

async function getWebhookEvents() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/webhooks/events`, {
    cache: 'no-store', // Always fetch fresh data
  });

  if (!res.ok) {
    throw new Error('Failed to fetch webhook events');
  }

  return res.json();
}

export default async function AdminWebhooksPage(): Promise<ReactNode> {
  const { events } = await getWebhookEvents();

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:py-10">
      <div className="mb-8">
        <Text as="h1" variant="h2" className="mb-2">
          Webhook Event Logs
        </Text>
        <Text as="p" variant="muted">
          Monitor webhook deliveries, debug integration issues, and retry failed events.
        </Text>
      </div>

      <WebhookEventLogsViewer
        events={events}
        onRetryEvent={async (eventId) => {
          'use server';
          await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/webhooks/retry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId }),
          });
        }}
        enableRealtime={true}
      />
    </div>
  );
}
```

---

## 🔄 Implementing Webhook Delivery System

### Create Webhook Service

```typescript
// lib/webhooks/delivery.ts
import { db } from '@/lib/db';
import type { WebhookEventType, WebhookEventPayload } from '@/lib/types/webhook';

export async function sendWebhook(
  eventType: WebhookEventType,
  payload: WebhookEventPayload,
  endpoint: string
): Promise<void> {
  const eventId = `wh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Create event record
  const event = await db.webhookEvents.create({
    data: {
      id: eventId,
      timestamp: new Date().toISOString(),
      eventType,
      status: 'pending',
      endpoint,
      payload,
      httpStatus: null,
      response: null,
      errorMessage: null,
      retryCount: 0,
      maxRetries: 3,
    },
  });

  // Send webhook asynchronously
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': eventType,
        'X-Webhook-ID': eventId,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const responseText = await response.text();

    await db.webhookEvents.update({
      where: { id: eventId },
      data: {
        status: response.ok ? 'success' : 'failed',
        httpStatus: response.status,
        response: responseText,
        errorMessage: response.ok ? null : `HTTP ${response.status}: ${response.statusText}`,
      },
    });
  } catch (error) {
    await db.webhookEvents.update({
      where: { id: eventId },
      data: {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        nextRetryAt: new Date(Date.now() + 60000), // Retry in 1 minute
      },
    });

    // Schedule retry
    scheduleRetry(eventId);
  }
}

function scheduleRetry(eventId: string): void {
  // Use a job queue like Bull, BullMQ, or Inngest
  // Example with setTimeout (not production-ready):
  setTimeout(async () => {
    const event = await db.webhookEvents.findUnique({ where: { id: eventId } });
    if (event && event.retryCount < event.maxRetries) {
      await retryWebhookEvent(eventId);
    }
  }, 60000);
}
```

### Usage Example

```typescript
// When a credit is issued
await sendWebhook(
  'credit.issued',
  {
    creditId: 'crd-12345',
    projectId: 'proj-001',
    quantity: 150.5,
    recipient: 'GAXYZ...ABC123',
    issuedAt: new Date().toISOString(),
  },
  'https://partner.com/webhooks/credits'
);
```

---

## 🔐 Adding Authentication

### Middleware Approach

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check if accessing admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const session = request.cookies.get('session');
    
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Verify admin role
    // ... your auth logic here
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/admin/:path*',
};
```

### Server Component Approach

```typescript
// app/admin/webhooks/page.tsx
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function AdminWebhooksPage() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== 'admin') {
    redirect('/login');
  }

  // ... rest of component
}
```

---

## 📊 Adding Analytics

### Track Webhook Metrics

```typescript
// lib/webhooks/analytics.ts
export async function getWebhookMetrics() {
  const [total, successful, failed, pending, retrying] = await Promise.all([
    db.webhookEvents.count(),
    db.webhookEvents.count({ where: { status: 'success' } }),
    db.webhookEvents.count({ where: { status: 'failed' } }),
    db.webhookEvents.count({ where: { status: 'pending' } }),
    db.webhookEvents.count({ where: { status: 'retrying' } }),
  ]);

  const successRate = total > 0 ? (successful / total) * 100 : 0;

  return {
    total,
    successful,
    failed,
    pending,
    retrying,
    successRate: successRate.toFixed(2),
  };
}
```

### Display Metrics

```tsx
// components/organisms/WebhookMetrics.tsx
export function WebhookMetrics({ metrics }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <Card>
        <CardContent className="pt-6">
          <Text variant="muted" className="text-sm">Total</Text>
          <Text variant="h3">{metrics.total}</Text>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Text variant="muted" className="text-sm">Success</Text>
          <Text variant="h3" className="text-stellar-green">{metrics.successful}</Text>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Text variant="muted" className="text-sm">Failed</Text>
          <Text variant="h3" className="text-destructive">{metrics.failed}</Text>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Text variant="muted" className="text-sm">Pending</Text>
          <Text variant="h3">{metrics.pending}</Text>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Text variant="muted" className="text-sm">Success Rate</Text>
          <Text variant="h3">{metrics.successRate}%</Text>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 🚀 Production Deployment Checklist

- [ ] Replace mock data with database queries
- [ ] Implement authentication middleware
- [ ] Set up webhook delivery service
- [ ] Configure retry queue (Bull, BullMQ, Inngest)
- [ ] Add rate limiting on retry endpoint
- [ ] Set up monitoring (Sentry, DataDog)
- [ ] Add audit logging for admin actions
- [ ] Configure CORS for webhook endpoints
- [ ] Set up webhook signature verification
- [ ] Add pagination for large datasets
- [ ] Implement data retention policy
- [ ] Set up automated tests
- [ ] Configure environment variables
- [ ] Add error tracking
- [ ] Set up performance monitoring

---

**Ready for production!** 🎉
