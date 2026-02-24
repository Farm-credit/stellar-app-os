'use client';

import { type ReactNode } from 'react';
import { Input } from '@/components/atoms/Input';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import type { TableFilterState } from '@/lib/types/admin';
import type {
  AdminProjectType,
  AdminProjectLifecycleStatus,
  AdminRiskRating,
} from '@/lib/types/adminProject';

interface TableFilterBarProps {
  filters: TableFilterState;
  onFilterChange: (filters: Partial<TableFilterState>) => void;
  projectTypes: AdminProjectType[];
  riskRatings: AdminRiskRating[];
  resultCount: number;
  totalCount: number;
}

export function TableFilterBar({
  filters,
  onFilterChange,
  projectTypes,
  riskRatings,
  resultCount,
  totalCount,
}: TableFilterBarProps): ReactNode {
  const lifecycleStatuses: AdminProjectLifecycleStatus[] = [
    'Draft',
    'Under Review',
    'Approved',
    'Paused',
    'Archived',
  ];

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
            placeholder="Search by name, ID, location, or country..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            variant="primary"
          />
        </div>
      </div>

      {/* Filter Controls */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        {/* Lifecycle Status Filter */}
        <div>
          <label htmlFor="lifecycle-filter" className="text-sm font-medium mb-1 block">
            Status
          </label>
          <select
            id="lifecycle-filter"
            value={filters.lifecycleStatus}
            onChange={(e) =>
              onFilterChange({
                lifecycleStatus: e.target.value as AdminProjectLifecycleStatus | 'all',
              })
            }
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All Statuses</option>
            {lifecycleStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {/* Type Filter */}
        <div>
          <label htmlFor="type-filter" className="text-sm font-medium mb-1 block">
            Type
          </label>
          <select
            id="type-filter"
            value={filters.projectType}
            onChange={(e) =>
              onFilterChange({ projectType: e.target.value as AdminProjectType | 'all' })
            }
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All Types</option>
            {projectTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Risk Filter */}
        <div>
          <label htmlFor="risk-filter" className="text-sm font-medium mb-1 block">
            Risk
          </label>
          <select
            id="risk-filter"
            value={filters.riskRating}
            onChange={(e) =>
              onFilterChange({ riskRating: e.target.value as AdminRiskRating | 'all' })
            }
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All Risks</option>
            {riskRatings.map((risk) => (
              <option key={risk} value={risk}>
                {risk} Risk
              </option>
            ))}
          </select>
        </div>

        {/* Sort By */}
        <div>
          <label htmlFor="sort-filter" className="text-sm font-medium mb-1 block">
            Sort By
          </label>
          <select
            id="sort-filter"
            value={filters.sortBy}
            onChange={(e) => onFilterChange({ sortBy: e.target.value as any })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="createdAt">Last Updated</option>
            <option value="name">Name</option>
            <option value="lifecycleStatus">Status</option>
            <option value="credits">Credits Available</option>
          </select>
        </div>

        {/* Sort Order */}
        <div>
          <label className="text-sm font-medium mb-1 block">Order</label>
          <div className="flex gap-2">
            <button
              onClick={() => onFilterChange({ sortOrder: 'asc' })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                filters.sortOrder === 'asc'
                  ? 'border-stellar-blue bg-stellar-blue/10 text-stellar-blue'
                  : 'border-input text-foreground hover:bg-muted'
              }`}
              title="Sort ascending"
            >
              ↑ Asc
            </button>
            <button
              onClick={() => onFilterChange({ sortOrder: 'desc' })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                filters.sortOrder === 'desc'
                  ? 'border-stellar-blue bg-stellar-blue/10 text-stellar-blue'
                  : 'border-input text-foreground hover:bg-muted'
              }`}
              title="Sort descending"
            >
              ↓ Desc
            </button>
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2">
        <Text variant="small">
          Showing <span className="font-semibold">{resultCount}</span> of{' '}
          <span className="font-semibold">{totalCount}</span> projects
        </Text>
        {resultCount < totalCount && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onFilterChange({
                search: '',
                lifecycleStatus: 'all',
                projectType: 'all',
                riskRating: 'all',
              })
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
