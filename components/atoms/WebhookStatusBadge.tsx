import { type ReactNode } from 'react';
import { Badge } from '@/components/atoms/Badge';
import type { WebhookEventStatus } from '@/lib/types/webhook';
import { getStatusColor } from '@/lib/webhook/webhookFilters';

interface WebhookStatusBadgeProps {
  status: WebhookEventStatus;
  className?: string;
  size?: 'sm' | 'md';
}

const statusDescriptions: Record<WebhookEventStatus, string> = {
  success: 'Event delivered successfully',
  failed: 'Event delivery failed',
  pending: 'Event pending delivery',
  retrying: 'Event being retried',
};

const statusIcons: Record<WebhookEventStatus, string> = {
  success: '✓',
  failed: '✕',
  pending: '○',
  retrying: '↻',
};

export function WebhookStatusBadge({
  status,
  className = '',
  size = 'md',
}: WebhookStatusBadgeProps): ReactNode {
  const variant = getStatusColor(status);
  const description = statusDescriptions[status];
  const icon = statusIcons[status];

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-1' : '';

  return (
    <Badge
      variant={
        variant as 'default' | 'secondary' | 'accent' | 'destructive' | 'outline' | 'success'
      }
      className={`${sizeClass} ${className}`}
      title={description}
    >
      <span className="mr-1" aria-hidden="true">
        {icon}
      </span>
      {status}
    </Badge>
  );
}
