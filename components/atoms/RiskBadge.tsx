import { type ReactNode } from 'react';
import { Badge } from '@/components/atoms/Badge';
import type { AdminRiskRating } from '@/lib/types/adminProject';
import { getRiskColor } from '@/lib/admin/projectFilters';

interface RiskBadgeProps {
  risk: AdminRiskRating;
  className?: string;
  size?: 'sm' | 'md';
}

const riskDescriptions: Record<AdminRiskRating, string> = {
  Low: 'Low risk project',
  Medium: 'Medium risk project',
  High: 'High risk project',
};

export function RiskBadge({ risk, className = '', size = 'md' }: RiskBadgeProps): ReactNode {
  const variant = getRiskColor(risk);
  const description = riskDescriptions[risk];

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-1' : '';

  return (
    <Badge
      variant={
        variant as 'default' | 'secondary' | 'accent' | 'destructive' | 'outline' | 'success'
      }
      className={`${sizeClass} ${className}`}
      title={description}
    >
      {risk} Risk
    </Badge>
  );
}
