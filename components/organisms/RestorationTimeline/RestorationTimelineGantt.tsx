'use client';

import * as React from 'react';

import { Badge } from '@/components/atoms/Badge';
import { Card } from '@/components/molecules/Card';
import { cn } from '@/lib/utils';
import {
  derivePhaseStatus,
  getPhaseBarLayout,
  getRestorationPhasesForProject,
  getTimelineSpan,
  phaseStatusClasses,
  PHASE_LABELS,
  type RestorationPhaseStatus,
} from '@/lib/restorationTimelines';

interface RestorationTimelineGanttProps {
  projectId: string;
}

const LEGEND: { status: RestorationPhaseStatus; label: string }[] = [
  { status: 'completed', label: 'Completed' },
  { status: 'in-progress', label: 'In progress' },
  { status: 'upcoming', label: 'Upcoming' },
];

function formatMonth(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function RestorationTimelineGantt({ projectId }: RestorationTimelineGanttProps) {
  const phases = React.useMemo(() => getRestorationPhasesForProject(projectId), [projectId]);
  const span = React.useMemo(() => getTimelineSpan(phases), [phases]);

  if (!span || phases.length === 0) {
    return (
      <Card className="p-6 border-stellar-green/10">
        <p className="text-sm text-muted-foreground">
          The restoration schedule for this project will be published soon.
        </p>
      </Card>
    );
  }

  const completedCount = phases.filter((p) => derivePhaseStatus(p) === 'completed').length;

  return (
    <Card className="p-6 space-y-5 border-stellar-green/10" data-testid="restoration-timeline">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {LEGEND.map((item) => (
            <span key={item.status} className="flex items-center gap-1.5">
              <span className={cn('h-3 w-3 rounded-sm', phaseStatusClasses(item.status))} />
              {item.label}
            </span>
          ))}
        </div>
        <Badge variant="secondary" className="bg-stellar-green/10 text-stellar-green">
          {completedCount}/{phases.length} phases complete
        </Badge>
      </div>

      <div className="space-y-3">
        {phases.map((phase) => {
          const status = derivePhaseStatus(phase);
          const { leftPercent, widthPercent } = getPhaseBarLayout(phase, span);
          return (
            <div
              key={phase.id}
              className="grid grid-cols-[minmax(120px,180px)_1fr] items-center gap-3 sm:grid-cols-[200px_1fr]"
              data-testid={`phase-row-${phase.kind}`}
            >
              <div className="min-w-0">
                <p
                  className={cn(
                    'truncate text-sm font-medium',
                    status === 'upcoming' && 'text-muted-foreground'
                  )}
                  title={PHASE_LABELS[phase.kind]}
                >
                  {phase.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatMonth(phase.startDate)} – {formatMonth(phase.endDate)}
                </p>
              </div>

              <div className="relative h-6 overflow-hidden rounded-md bg-muted/60">
                <div
                  className={cn(
                    'absolute top-0 h-full rounded-md transition-all',
                    phaseStatusClasses(status)
                  )}
                  style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                  role="img"
                  aria-label={`${phase.name}: ${status}, ${phase.progressPercent}% complete`}
                >
                  {status !== 'upcoming' && (
                    <div
                      className="h-full rounded-md bg-black/15"
                      style={{ width: `${phase.progressPercent}%` }}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    'pointer-events-none absolute top-1/2 -translate-y-1/2 px-2 text-xs font-semibold',
                    status === 'completed' || status === 'in-progress'
                      ? 'text-white'
                      : 'text-gray-700 dark:text-gray-200'
                  )}
                  style={{ left: `${leftPercent}%` }}
                >
                  {phase.progressPercent}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatMonth(new Date(span.startMs).toISOString().slice(0, 10))}</span>
        <span>{formatMonth(new Date(span.endMs).toISOString().slice(0, 10))}</span>
      </div>
    </Card>
  );
}
