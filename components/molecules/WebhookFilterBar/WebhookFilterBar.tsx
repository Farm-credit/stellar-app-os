'use client';

import { type ReactNode } from 'react';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Text } from '@/components/atoms/Text';
import type { WebhookFilterState, WebhookEventType, WebhookEventStatus } from '@/lib/types/webhook';

interface WebhookFilterBarProps {
  filters: WebhookFilterState;
  onFilterChange: (filters: Partial<WebhookFilterState>) => void;
  eventTypes: WebhookEventType[];
  resultCount: number;
  totalCount: number;
}

export function WebhookFilterBar({
  filters,
  onFilterChange,
  eventTypes,
  resultCount,
  totalCount,
}: WebhookFilterBarProps): ReactNode {
  const statuses: WebhookEventStatus[] = ['success', 'failed', 'pending', 'retrying'];

  return (
    <div className="space-y-4 mb-6">
      {/* Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="search" className="text-sm font-medium mb-1 block">
            Search
          </label>
          <Input
            id="search"
            type="text"
            placeholder="Search by ID, event type, endpoint, or error..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            variant="primary"
          />
        </div>
      </div>

      {/* Filter Controls */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {/* Status Filter */}
        <div>
          <label htmlFor="status-filter" className="text-sm font-medium mb-1 block">
            Status
          </label>
          <Select
            id="status-filter"
            value={filters.status}
            onChange={(e) =>
              onFilterChange({ status: e.target.value as WebhookEventStatus | 'all' })
            }
            variant="primary"
          >
            <option value="all">All Statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </Select>
        </div>

        {/* Event Type Filter */}
        <div>
          <label htmlFor="event-type-filter" className="text-sm font-medium mb-1 block">
            Event Type
          </label>
          <Select
            id="event-type-filter"
            value={filters.eventType}
            onChange={(e) =>
              onFilterChange({ eventType: e.target.value as WebhookEventType | 'all' })
            }
            variant="primary"
          >
            <option value="all">All Types</option>
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>

        {/* Sort By */}
        <div>
          <label htmlFor="sort-by" className="text-sm font-medium mb-1 block">
            Sort By
          </label>
          <Select
            id="sort-by"
            value={filters.sortBy}
            onChange={(e) =>
              onFilterChange({ sortBy: e.target.value as 'timestamp' | 'eventType' | 'status' })
            }
            variant="primary"
          >
            <option value="timestamp">Timestamp</option>
            <option value="eventType">Event Type</option>
            <option value="status">Status</option>
          </Select>
        </div>

        {/* Sort Order */}
        <div>
          <label htmlFor="sort-order" className="text-sm font-medium mb-1 block">
            Order
          </label>
          <Select
            id="sort-order"
            value={filters.sortOrder}
            onChange={(e) => onFilterChange({ sortOrder: e.target.value as 'asc' | 'desc' })}
            variant="primary"
          >
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </Select>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <Text variant="muted" className="text-sm">
          Showing {resultCount} of {totalCount} events
        </Text>
      </div>
    </div>
  );
}
