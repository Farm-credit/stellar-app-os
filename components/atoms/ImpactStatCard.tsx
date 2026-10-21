import type { JSX, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ImpactStatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  className?: string;
}

export function ImpactStatCard({
  label,
  value,
  icon,
  className,
}: ImpactStatCardProps): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border bg-card p-6 shadow-sm', className)}>
      <div className="flex items-center gap-2 text-muted-foreground">{icon}</div>
      <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
