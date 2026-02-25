'use client';

import React, { type ReactNode, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { WebhookStatusBadge } from '@/components/atoms/WebhookStatusBadge';
import { Text } from '@/components/atoms/Text';
import type { WebhookEvent } from '@/lib/types/webhook';
import { formatTimestamp, canRetryEvent } from '@/lib/webhook/webhookFilters';

interface WebhookEventRowProps {
  event: WebhookEvent;
  onRetry: (eventId: string) => void;
  onViewDetails: (event: WebhookEvent) => void;
  isRetrying?: boolean;
}

export function WebhookEventRow({
  event,
  onRetry,
  onViewDetails,
  isRetrying = false,
}: WebhookEventRowProps): ReactNode {
  const [isExpanded, setIsExpanded] = useState(false);

  const getPayloadPreview = (payload: Record<string, unknown>): string => {
    const keys = Object.keys(payload);
    if (keys.length === 0) return 'Empty payload';
    const preview = keys.slice(0, 3).join(', ');
    return keys.length > 3 ? `${preview}...` : preview;
  };

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/50 transition-colors">
        {/* Timestamp */}
        <td className="px-4 py-3 whitespace-nowrap">
          <Text variant="small" className="font-mono text-xs">
            {formatTimestamp(event.timestamp)}
          </Text>
        </td>

        {/* Event Type */}
        <td className="px-4 py-3">
          <Text variant="small" className="font-medium">
            {event.eventType}
          </Text>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <WebhookStatusBadge status={event.status} size="sm" />
        </td>

        {/* HTTP Status */}
        <td className="px-4 py-3 text-center">
          {event.httpStatus !== null ? (
            <Text
              variant="small"
              className={`font-mono ${
                event.httpStatus >= 200 && event.httpStatus < 300
                  ? 'text-stellar-green'
                  : event.httpStatus >= 400
                    ? 'text-destructive'
                    : 'text-muted-foreground'
              }`}
            >
              {event.httpStatus}
            </Text>
          ) : (
            <Text variant="muted" className="text-xs">
              —
            </Text>
          )}
        </td>

        {/* Payload Preview */}
        <td className="px-4 py-3 max-w-xs">
          <Text variant="small" className="truncate text-muted-foreground">
            {getPayloadPreview(event.payload)}
          </Text>
        </td>

        {/* Retry Count */}
        <td className="px-4 py-3 text-center">
          <Text variant="small" className="font-mono">
            {event.retryCount}/{event.maxRetries}
          </Text>
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex gap-1.5 flex-wrap">
            <Button
              onClick={() => onViewDetails(event)}
              variant="outline"
              size="sm"
              className="text-xs"
              title="View full event details"
            >
              View
            </Button>
            {canRetryEvent(event) && (
              <Button
                onClick={() => onRetry(event.id)}
                stellar="primary"
                size="sm"
                className="text-xs"
                disabled={isRetrying}
                title="Retry failed webhook"
              >
                {isRetrying ? 'Retrying...' : 'Retry'}
              </Button>
            )}
          </div>
        </td>
      </tr>

      {/* Expandable Error Message Row */}
      {event.errorMessage && isExpanded && (
        <tr className="bg-destructive/5 border-b border-border">
          <td colSpan={7} className="px-4 py-3">
            <div className="flex items-start gap-2">
              <Text variant="small" className="font-semibold text-destructive">
                Error:
              </Text>
              <Text variant="small" className="text-destructive">
                {event.errorMessage}
              </Text>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
