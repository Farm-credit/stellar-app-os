import { Sprout, TreeDeciduous, Trees } from 'lucide-react';
import type { TreeGrowthStage } from '@/lib/types/tree';
import { GROWTH_STAGE_LABELS } from '@/lib/tree-growth/stages';
import { cn } from '@/lib/utils';

const STAGE_STYLES: Record<
  TreeGrowthStage,
  {
    icon: typeof Sprout;
    className: string;
  }
> = {
  sapling: {
    icon: Sprout,
    className:
      'border-lime-500/30 bg-lime-500/15 text-lime-700 dark:text-lime-300',
  },
  juvenile: {
    icon: TreeDeciduous,
    className:
      'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  mature: {
    icon: Trees,
    className:
      'border-green-700/30 bg-green-700/15 text-green-800 dark:text-green-300',
  },
};

export interface TreeGrowthStageBadgeProps {
  stage: TreeGrowthStage;
  className?: string;
}

export function TreeGrowthStageBadge({ stage, className }: TreeGrowthStageBadgeProps) {
  const { icon: Icon, className: stageClass } = STAGE_STYLES[stage];
  const label = GROWTH_STAGE_LABELS[stage];

  return (
    <span
      data-testid="tree-growth-stage-badge"
      data-stage={stage}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        stageClass,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}
