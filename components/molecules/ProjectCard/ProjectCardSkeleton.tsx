import * as React from 'react';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/molecules/Card';

export function ProjectCardSkeleton() {
  return (
    <Card className="overflow-hidden flex flex-col h-full border-muted">
      {/* Image Area Skeleton */}
      <div className="relative h-48 w-full bg-muted animate-pulse">
        {/* Badge Skeleton */}
        <div className="absolute top-3 right-3 h-5 w-24 bg-muted-foreground/20 rounded-full" />
      </div>

      <CardHeader className="p-5 pb-3 flex-none space-y-2">
        {/* Location Skeleton */}
        <div className="flex items-center space-x-2 mb-1">
          <div className="h-3.5 w-3.5 rounded-full bg-muted animate-pulse" />
          <div className="h-3 w-24 bg-muted animate-pulse rounded" />
        </div>
        {/* Title Skeleton */}
        <div className="h-6 w-3/4 bg-muted animate-pulse rounded" />
      </CardHeader>

      <CardContent className="p-5 pt-0 flex-grow flex flex-col justify-between space-y-4">
        {/* Description Skeleton (2 lines) */}
        <div className="space-y-2">
          <div className="h-4 w-full bg-muted animate-pulse rounded" />
          <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
        </div>

        {/* Progress Area Skeleton */}
        <div className="space-y-2 mt-auto pt-4">
          <div className="flex justify-between items-end">
            <div className="h-4 w-16 bg-muted animate-pulse rounded" />
            <div className="h-3 w-20 bg-muted animate-pulse rounded" />
          </div>

          <div className="h-2 w-full bg-muted animate-pulse rounded-full" />
        </div>
      </CardContent>

      <CardFooter className="p-5 pt-4 border-t bg-muted/10 flex items-center justify-between flex-none gap-3">
        {/* Price Skeleton */}
        <div className="flex flex-col space-y-1">
          <div className="h-3 w-8 bg-muted animate-pulse rounded" />
          <div className="h-6 w-16 bg-muted animate-pulse rounded" />
        </div>

        {/* Button Skeleton */}
        <div className="h-10 w-full sm:w-28 bg-muted animate-pulse rounded-md" />
      </CardFooter>
    </Card>
  );
}
