import { type ReactNode } from 'react';
import { Badge } from '@/components/atoms/Badge';
import type { AdminProjectLifecycleStatus } from '@/lib/types/adminProject';
import { getStatusColor } from '@/lib/admin/projectFilters';

interface StatusBadgeProps {
  status: AdminProjectLifecycleStatus;
  className?: string;
  size?: 'sm' | 'md';
}

const statusDescriptions: Record<AdminProjectLifecycleStatus, string> = {
  Draft: 'Project in initial draft state',
  'Under Review': 'Project submitted for admin review',
  Approved: 'Project approved and active',
  Paused: 'Project temporarily paused',
  Archived: 'Project archived and inactive',
};

export function StatusBadge({ status, className = '', size = 'md' }: StatusBadgeProps): ReactNode {
  const variant = getStatusColor(status);
  const description = statusDescriptions[status];

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-1' : '';

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={
          variant as 'default' | 'secondary' | 'accent' | 'destructive' | 'outline' | 'success'
        }
        className={`${sizeClass} ${className}`}
        title={description}
      >
        {status}
      </Badge>
    </div>
  );
}
