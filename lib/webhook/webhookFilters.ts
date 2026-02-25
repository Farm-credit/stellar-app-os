import type {
  WebhookEvent,
  WebhookEventStatus,
  WebhookEventType,
  WebhookFilterState,
} from '@/lib/types/webhook';

export function filterWebhookEvents(
  events: WebhookEvent[],
  filters: WebhookFilterState
): WebhookEvent[] {
  let filtered = events;

  // Search filter
  if (filters.search.trim()) {
    const query = filters.search.toLowerCase();
    filtered = filtered.filter(
      (event) =>
        event.id.toLowerCase().includes(query) ||
        event.eventType.toLowerCase().includes(query) ||
        event.endpoint.toLowerCase().includes(query) ||
        (event.errorMessage && event.errorMessage.toLowerCase().includes(query))
    );
  }

  // Status filter
  if (filters.status !== 'all') {
    filtered = filtered.filter((event) => event.status === filters.status);
  }

  // Event type filter
  if (filters.eventType !== 'all') {
    filtered = filtered.filter((event) => event.eventType === filters.eventType);
  }

  // Sorting
  filtered.sort((a, b) => {
    let comparison = 0;

    switch (filters.sortBy) {
      case 'timestamp':
        comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        break;
      case 'eventType':
        comparison = a.eventType.localeCompare(b.eventType);
        break;
      case 'status':
        comparison = a.status.localeCompare(b.status);
        break;
      default:
        comparison = 0;
    }

    return filters.sortOrder === 'asc' ? comparison : -comparison;
  });

  return filtered;
}

export function getEventTypes(events: WebhookEvent[]): WebhookEventType[] {
  const types = new Set<WebhookEventType>();
  events.forEach((event) => types.add(event.eventType));
  return Array.from(types).sort();
}

export function getStatusColor(status: WebhookEventStatus): string {
  switch (status) {
    case 'success':
      return 'success';
    case 'failed':
      return 'destructive';
    case 'pending':
      return 'secondary';
    case 'retrying':
      return 'accent';
    default:
      return 'default';
  }
}

export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function canRetryEvent(event: WebhookEvent): boolean {
  return event.status === 'failed' && event.retryCount < event.maxRetries;
}
