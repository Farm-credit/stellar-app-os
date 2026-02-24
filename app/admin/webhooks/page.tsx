import type { ReactNode } from 'react';
import { Text } from '@/components/atoms/Text';
import { WebhookEventLogsViewer } from '@/components/organisms/WebhookEventLogsViewer/WebhookEventLogsViewer';
import { mockWebhookEvents } from '@/lib/api/mock/webhookEvents';

export default function AdminWebhooksPage(): ReactNode {
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
        events={mockWebhookEvents}
        onRetryEvent={async (eventId) => {
          console.log('Retrying event:', eventId);
          // TODO: Implement API call to retry webhook
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }}
        enableRealtime={true}
      />
    </div>
  );
}
