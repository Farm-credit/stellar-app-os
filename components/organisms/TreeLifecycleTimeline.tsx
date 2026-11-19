'use client';

import { Check, Circle, Clock3 } from 'lucide-react';
import type { Tree, TreeStatus } from '@/lib/types/tree';

interface TreeLifecycleTimelineProps {
  tree: Tree;
}

type MilestoneKey = 'pending' | 'planted' | 'first-photo' | 'verified' | 'one-year';

interface LifecycleMilestone {
  key: MilestoneKey;
  label: string;
  description: string;
  date?: string;
  complete: boolean;
}

const STATUS_ORDER: TreeStatus[] = ['funded', 'planted', 'verified', 'completed'];

function formatDate(value?: string) {
  if (!value) return undefined;
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getMilestones(tree: Tree): LifecycleMilestone[] {
  const statusIndex = STATUS_ORDER.indexOf(tree.status);
  const planted = statusIndex >= STATUS_ORDER.indexOf('planted') || Boolean(tree.plantedAt);
  const verified = statusIndex >= STATUS_ORDER.indexOf('verified');
  const oneYear = tree.status === 'completed';

  return [
    {
      key: 'pending',
      label: 'Pending',
      description: 'Your sponsorship is recorded and awaiting planting.',
      complete: true,
    },
    {
      key: 'planted',
      label: 'Planted',
      description: 'The tree has been planted at the project location.',
      date: formatDate(tree.plantedAt),
      complete: planted,
    },
    {
      key: 'first-photo',
      label: 'First photo',
      description: 'The first field photo will appear when submitted by the planter.',
      complete: verified,
    },
    {
      key: 'verified',
      label: 'Verified',
      description: 'The planting evidence has passed verification.',
      complete: verified,
    },
    {
      key: 'one-year',
      label: '1-year milestone',
      description: 'The tree reaches its first annual survival milestone.',
      complete: oneYear,
    },
  ];
}

/** Interactive, accessible lifecycle view for one sponsored tree. */
export function TreeLifecycleTimeline({ tree }: TreeLifecycleTimelineProps) {
  const milestones = getMilestones(tree);

  return (
    <div data-testid="tree-lifecycle-timeline" className="space-y-1">
      {milestones.map((milestone, index) => (
        <details key={milestone.key} open={milestone.complete} className="group">
          <summary className="flex cursor-pointer list-none items-start gap-3 rounded-xl p-3 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                milestone.complete
                  ? 'border-stellar-green bg-stellar-green/10 text-stellar-green'
                  : 'border-muted-foreground/30 text-muted-foreground'
              }`}
              aria-hidden
            >
              {milestone.complete ? <Check className="h-4 w-4" /> : index === 0 ? <Circle className="h-3 w-3" /> : <Clock3 className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{milestone.label}</span>
                <span className="text-xs text-muted-foreground">
                  {milestone.date ?? (milestone.complete ? 'Completed' : 'Upcoming')}
                </span>
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">{milestone.description}</span>
            </span>
          </summary>
        </details>
      ))}
    </div>
  );
}
