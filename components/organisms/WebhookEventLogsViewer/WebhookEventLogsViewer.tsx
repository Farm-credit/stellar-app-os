'use client';

import React, { useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { WebhookEventRow } from '@/components/molecules/WebhookEventRow/WebhookEventRow';
import { WebhookFilterBar } from '@/components/molecules/WebhookFilterBar/WebhookFilterBar';
import { WebhookDetailsModal } from '@/components/molecules/WebhookDetailsModal/WebhookDetailsModal';
import type { WebhookEvent, WebhookFilterState } from '@/lib/types/webhook';
import { filterWebhookEvents, getEventTypes } from '@/lib/webhook/webhookFilters';

interface WebhookEventLogsViewerProps {
  events: WebhookEvent[];
  onRetryEvent?: (eventId: string) => Promise<void>;
  enableRealtime?: boolean;
}

export function WebhookEventLogsViewer({
  events: initialEvents,
  onRetryEvent,
  enableRealtime = false,
}: WebhookEventLogsViewerProps): ReactNode {
  const [events, setEvents] = useState<WebhookEvent[]>(initialEvents);
  const [filters, setFilters] = useState<WebhookFilterState>({
    search: '',
    status: 'all',
    eventType: 'all',
    sortBy: 'timestamp',
    sortOrder: 'desc',
  });

  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [retryingEventId, setRetryingEventId] = useState<string | null>(null);

  // Simulate real-time updates
  useEffect(() => {
    if (!enableRealtime) return;

    const interval = setInterval(() => {
      // Simulate new events or status updates
      setEvents((prevEvents: WebhookEvent[]) => {
        const updatedEvents = [...prevEvents];
        // Update retrying events to success/failed randomly
        updatedEvents.forEach((event, index) => {
          if (event.status === 'retrying' && Math.random() > 0.7) {
            updatedEvents[index] = {
              ...event,
              status: Math.random() > 0.5 ? 'success' : 'failed',
              httpStatus: Math.random() > 0.5 ? 200 : 500,
              retryCount: event.retryCount + 1,
            };
          }
        });
        return updatedEvents;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [enableRealtime]);

  // Update events when initialEvents change
  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  // Filter and sort events
  const filteredEvents = useMemo(() => filterWebhookEvents(events, filters), [events, filters]);

  const eventTypes = useMemo(() => getEventTypes(events), [events]);

  // Handle filter changes
  const handleFilterChange = useCallback((newFilters: Partial<WebhookFilterState>) => {
    setFilters((prev: WebhookFilterState) => ({ ...prev, ...newFilters }));
  }, []);

  // Handle retry
  const handleRetry = useCallback(
    async (eventId: string) => {
      if (!onRetryEvent) return;

      setRetryingEventId(eventId);
      try {
        await onRetryEvent(eventId);
        // Update event status optimistically
        setEvents((prevEvents: WebhookEvent[]) =>
          prevEvents.map((event: WebhookEvent) =>
            event.id === eventId
              ? { ...event, status: 'retrying' as const, retryCount: event.retryCount + 1 }
              : event
          )
        );
      } catch (error) {
        console.error('Failed to retry event:', error);
      } finally {
        setRetryingEventId(null);
      }
    },
    [onRetryEvent]
  );

  // Handle view details
  const handleViewDetails = useCallback((event: WebhookEvent) => {
    setSelectedEvent(event);
    setIsModalOpen(true);
  }, []);

  // Handle close modal
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedEvent(null);
  }, []);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Webhook Event Logs</CardTitle>
              <CardDescription>
                Monitor webhook deliveries, view payloads, and retry failed events
              </CardDescription>
            </div>
            {enableRealtime && (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-stellar-green animate-pulse" />
                <Text variant="small" className="text-stellar-green">
                  Live
                </Text>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <WebhookFilterBar
            filters={filters}
            onFilterChange={handleFilterChange}
            eventTypes={eventTypes}
            resultCount={filteredEvents.length}
            totalCount={events.length}
          />

          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Text variant="muted" className="mb-2">
                No webhook events found
              </Text>
              <Text variant="muted" className="text-sm">
                {filters.search || filters.status !== 'all' || filters.eventType !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Webhook events will appear here once triggered'}
              </Text>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-semibold">Timestamp</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Event Type</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold">HTTP</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Payload Preview</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold">Retries</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((event: WebhookEvent) => (
                    <WebhookEventRow
                      key={event.id}
                      event={event}
                      onRetry={handleRetry}
                      onViewDetails={handleViewDetails}
                      isRetrying={retryingEventId === event.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <WebhookDetailsModal isOpen={isModalOpen} event={selectedEvent} onClose={handleCloseModal} />
    </>
  );
}
