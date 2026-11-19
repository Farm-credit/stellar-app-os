'use client';

import { type JSX } from 'react';
import { cn } from '@/lib/utils';

export interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: JSX.Element;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
  loading?: boolean;
}

export function MetricCard({
  title,
  value,
  change,
  changeLabel = 'vs last month',
  icon,
  trend = 'neutral',
  className,
  loading = false,
}: MetricCardProps): JSX.Element {
  if (loading) {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-6', className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-1/2 rounded bg-muted" />
          <div className="h-8 w-3/4 rounded bg-muted" />
          <div className="h-4 w-1/3 rounded bg-muted" />
        </div>
      </div>
    );
  }

  const trendColors = {
    up: 'text-green-500',
    down: 'text-red-500',
    neutral: 'text-muted-foreground',
  };

  const trendIcons = {
    up: '↑',
    down: '↓',
    neutral: '→',
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:shadow-lg hover:border-stellar-blue/50',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          {change !== undefined && (
            <p className={cn('text-sm', trendColors[trend])}>
              {trendIcons[trend]} {Math.abs(change)}% {changeLabel}
            </p>
          )}
        </div>
        {icon && <div className="rounded-lg bg-stellar-blue/10 p-2 text-stellar-blue">{icon}</div>}
      </div>
    </div>
  );
}
