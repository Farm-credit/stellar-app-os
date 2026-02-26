'use client';

import React, { type ReactNode, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { WebhookStatusBadge } from '@/components/atoms/WebhookStatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import type { WebhookEvent } from '@/lib/types/webhook';
import { formatTimestamp } from '@/lib/webhook/webhookFilters';

interface WebhookDetailsModalProps {
  isOpen: boolean;
  event: WebhookEvent | null;
  onClose: () => void;
}

export function WebhookDetailsModal({
  isOpen,
  event,
  onClose,
}: WebhookDetailsModalProps): ReactNode {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!isOpen || !event) {
    return null;
  }

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatJson = (obj: unknown): string => {
    return JSON.stringify(obj, null, 2);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="webhook-details-title"
    >
      <Card
        className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <CardHeader className="border-b">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle id="webhook-details-title">Webhook Event Details</CardTitle>
              <Text variant="muted" className="mt-1">
                Event ID: {event.id}
              </Text>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close modal"
            >
              ✕
            </Button>
          </div>
        </CardHeader>

        <CardContent className="overflow-y-auto flex-1 p-6">
          <div className="space-y-6">
            {/* Event Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Text variant="small" className="font-semibold mb-1">
                  Timestamp
                </Text>
                <Text variant="small" className="font-mono">
                  {formatTimestamp(event.timestamp)}
                </Text>
              </div>

              <div>
                <Text variant="small" className="font-semibold mb-1">
                  Event Type
                </Text>
                <Text variant="small">{event.eventType}</Text>
              </div>

              <div>
                <Text variant="small" className="font-semibold mb-1">
                  Status
                </Text>
                <WebhookStatusBadge status={event.status} />
              </div>

              <div>
                <Text variant="small" className="font-semibold mb-1">
                  HTTP Status
                </Text>
                <Text variant="small" className="font-mono">
                  {event.httpStatus !== null ? event.httpStatus : 'N/A'}
                </Text>
              </div>

              <div className="md:col-span-2">
                <Text variant="small" className="font-semibold mb-1">
                  Endpoint
                </Text>
                <Text variant="small" className="font-mono break-all">
                  {event.endpoint}
                </Text>
              </div>

              <div>
                <Text variant="small" className="font-semibold mb-1">
                  Retry Count
                </Text>
                <Text variant="small">
                  {event.retryCount} / {event.maxRetries}
                </Text>
              </div>

              {event.nextRetryAt && (
                <div>
                  <Text variant="small" className="font-semibold mb-1">
                    Next Retry At
                  </Text>
                  <Text variant="small" className="font-mono">
                    {formatTimestamp(event.nextRetryAt)}
                  </Text>
                </div>
              )}
            </div>

            {/* Error Message */}
            {event.errorMessage && (
              <div>
                <Text variant="small" className="font-semibold mb-2">
                  Error Message
                </Text>
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3">
                  <Text variant="small" className="text-destructive font-mono">
                    {event.errorMessage}
                  </Text>
                </div>
              </div>
            )}

            {/* Payload */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Text variant="small" className="font-semibold">
                  Payload
                </Text>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(formatJson(event.payload), 'payload')}
                  className="text-xs"
                >
                  {copiedField === 'payload' ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <div className="rounded-lg bg-muted p-4 overflow-x-auto">
                <pre className="text-xs font-mono">{formatJson(event.payload)}</pre>
              </div>
            </div>

            {/* Response */}
            {event.response && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Text variant="small" className="font-semibold">
                    Response
                  </Text>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(event.response || '', 'response')}
                    className="text-xs"
                  >
                    {copiedField === 'response' ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <div className="rounded-lg bg-muted p-4 overflow-x-auto">
                  <pre className="text-xs font-mono">{event.response}</pre>
                </div>
              </div>
            )}
          </div>
        </CardContent>

        <div className="border-t p-4 flex justify-end">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
