import { type NextRequest } from 'next/server';
import { TreeStatusPoller } from '@/lib/tree-status/poller';
import type { TreeStatusEvent } from '@/lib/tree-status/types';

export const runtime = 'nodejs';

function sseSerialize(event: string, data: TreeStatusEvent): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
  await Promise.resolve();
  const poller = new TreeStatusPoller(3000);

  let closed = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  function cleanup() {
    closed = true;
    if (pollTimer) clearInterval(pollTimer);
    if (keepAliveTimer) clearInterval(keepAliveTimer);
  }

  request.signal.addEventListener('abort', cleanup);

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: TreeStatusEvent) => {
        try {
          controller.enqueue(new TextEncoder().encode(sseSerialize(event, data)));
        } catch {
          cleanup();
        }
      };

      const poll = async () => {
        if (closed) return;
        try {
          const events = await poller.poll();
          for (const event of events) {
            send('tree-status', event);
          }
        } catch (err) {
          console.error('[sse/trees/status] poll error:', err);
        }
      };

      keepAliveTimer = setInterval(() => {
        if (closed) {
          cleanup();
          return;
        }
        try {
          controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
        } catch {
          cleanup();
        }
      }, 15_000);

      pollTimer = setInterval(poll, 3000);

      poll();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
