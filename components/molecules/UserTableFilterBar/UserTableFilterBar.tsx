'use client';

import { type ReactNode } from 'react';
import { Input } from '@/components/atoms/Input';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import type { UserTableFilterState, AdminUserStatus } from '@/lib/types/adminUser';

const USER_STATUSES: AdminUserStatus[] = ['Active', 'Suspended', 'Deleted'];

type SortByOption = UserTableFilterState['sortBy'];

interface UserTableFilterBarProps {
  filters: UserTableFilterState;
  onFilterChange: (filters: Partial<UserTableFilterState>) => void;
  resultCount: number;
  totalCount: number;
}

export function UserTableFilterBar({
  filters,
  onFilterChange,
  resultCount,
  totalCount,
}: UserTableFilterBarProps): ReactNode {
  return (
    <div className="mb-6 space-y-4">
      {/* Search */}
      <div>
        <label htmlFor="user-search" className="mb-1 block text-sm font-medium">
          Search
        </label>
        <Input
          id="user-search"
          type="text"
          placeholder="Search by email or wallet address..."
          value={filters.search}
          onChange={(e) => onFilterChange({ search: e.target.value })}
          variant="primary"
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {/* Status */}
        <div>
          <label htmlFor="user-status-filter" className="mb-1 block text-sm font-medium">
            Status
          </label>
          <select
            id="user-status-filter"
            value={filters.status}
            onChange={(e) =>
              onFilterChange({ status: e.target.value as AdminUserStatus | 'all' })
            }
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All Statuses</option>
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Sort By */}
        <div>
          <label htmlFor="user-sort-filter" className="mb-1 block text-sm font-medium">
            Sort By
          </label>
          <select
            id="user-sort-filter"
            value={filters.sortBy}
            onChange={(e) => onFilterChange({ sortBy: e.target.value as SortByOption })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="lastActiveAt">Last Active</option>
            <option value="joinedAt">Joined Date</option>
            <option value="email">Email</option>
            <option value="donations">Total Donations</option>
            <option value="credits">Total Credits</option>
          </select>
        </div>

        {/* Sort Order */}
        <div>
          <span className="mb-1 block text-sm font-medium">Order</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onFilterChange({ sortOrder: 'asc' })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                filters.sortOrder === 'asc'
                  ? 'border-stellar-blue bg-stellar-blue/10 text-stellar-blue'
                  : 'border-input text-foreground hover:bg-muted'
              }`}
              aria-label="Sort ascending"
              aria-pressed={filters.sortOrder === 'asc'}
            >
              ↑ Asc
            </button>
            <button
              type="button"
              onClick={() => onFilterChange({ sortOrder: 'desc' })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                filters.sortOrder === 'desc'
                  ? 'border-stellar-blue bg-stellar-blue/10 text-stellar-blue'
                  : 'border-input text-foreground hover:bg-muted'
              }`}
              aria-label="Sort descending"
              aria-pressed={filters.sortOrder === 'desc'}
            >
              ↓ Desc
            </button>
          </div>
        </div>
      </div>

      {/* Results summary */}
      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2">
        <Text variant="small">
          Showing <span className="font-semibold">{resultCount}</span> of{' '}
          <span className="font-semibold">{totalCount}</span> users
        </Text>
        {resultCount < totalCount && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onFilterChange({ search: '', status: 'all' })
            }
            className="text-xs"
          >
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  );
}
