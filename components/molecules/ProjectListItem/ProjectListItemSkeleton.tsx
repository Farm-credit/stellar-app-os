import * as React from 'react';

export function ProjectListItemSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row gap-4 p-4 border border-muted rounded-lg bg-card">
      {/* Image Skeleton */}
      <div className="relative h-32 w-full sm:h-24 sm:w-32 flex-shrink-0 bg-muted animate-pulse rounded-md" />

      {/* Content Skeleton */}
      <div className="flex-grow flex flex-col sm:flex-row gap-4">
        {/* Main Info Skeleton */}
        <div className="flex-grow space-y-3">
          <div className="space-y-2">
            {/* Location */}
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 rounded-full bg-muted animate-pulse" />
              <div className="h-3 w-24 bg-muted animate-pulse rounded" />
            </div>
            {/* Title & Badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="h-6 w-2/3 bg-muted animate-pulse rounded" />
              <div className="h-5 w-24 bg-muted animate-pulse rounded-full" />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="h-4 w-full bg-muted animate-pulse rounded" />
            <div className="h-4 w-4/5 bg-muted animate-pulse rounded" />
          </div>

          {/* Progress */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <div className="h-3 w-16 bg-muted animate-pulse rounded" />
              <div className="h-3 w-20 bg-muted animate-pulse rounded" />
            </div>
            <div className="h-1.5 w-full bg-muted animate-pulse rounded-full" />
          </div>
        </div>

        {/* Price & Action Skeleton */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 sm:min-w-[140px] pt-2 sm:pt-0 border-t sm:border-t-0 sm:border-l sm:pl-4">
          <div className="flex flex-col items-start sm:items-end space-y-1">
            <div className="h-3 w-8 bg-muted animate-pulse rounded" />
            <div className="h-6 w-16 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-9 w-full sm:w-24 bg-muted animate-pulse rounded-md" />
        </div>
      </div>
    </div>
  );
}
