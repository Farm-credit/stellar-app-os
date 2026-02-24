import type { ReactNode } from 'react';

interface AnalyticsSummaryCardProps {
  label: string;
  value: string;
  icon: ReactNode;
}

export function AnalyticsSummaryCard({ label, value, icon }: AnalyticsSummaryCardProps): ReactNode {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-background shadow-sm">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold leading-tight">{value}</p>
      </div>
    </div>
  );
}
