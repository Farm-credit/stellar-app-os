import { cn } from '@/lib/utils';
import type { VoteTally } from './types';

interface VoteProgressBarProps {
  votes: VoteTally;
  className?: string;
}

interface VoteSegment {
  key: keyof VoteTally;
  label: string;
  color: string;
  bgColor: string;
}

const segments: VoteSegment[] = [
  { key: 'for', label: 'For', color: 'bg-stellar-green', bgColor: 'bg-stellar-green/15' },
  { key: 'against', label: 'Against', color: 'bg-destructive', bgColor: 'bg-destructive/15' },
  { key: 'abstain', label: 'Abstain', color: 'bg-muted-foreground/50', bgColor: 'bg-muted' },
];

function getTotal(votes: VoteTally): number {
  return votes.for + votes.against + votes.abstain;
}

function toPercent(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

export function VoteProgressBar({ votes, className }: VoteProgressBarProps) {
  const total = getTotal(votes);

  return (
    <div className={cn('flex flex-col gap-2', className)} role="group" aria-label="Vote breakdown">
      <div
        className="flex h-3 w-full overflow-hidden rounded-full"
        aria-label={`Results: ${toPercent(votes.for, total)}% for, ${toPercent(votes.against, total)}% against, ${toPercent(votes.abstain, total)}% abstain`}
      >
        {segments.map((seg) => {
          const pct = toPercent(votes[seg.key], total);
          if (pct === 0) return null;
          return (
            <div
              key={seg.key}
              className={cn('h-full transition-all duration-500', seg.color)}
              style={{ width: `${pct}%` }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => {
          const count = votes[seg.key];
          const pct = toPercent(count, total);
          return (
            <div key={seg.key} className="flex items-center gap-1.5 text-sm">
              <span className={cn('size-2.5 rounded-full', seg.color)} />
              <span className="text-muted-foreground">{seg.label}</span>
              <span className="font-medium tabular-nums">{pct}%</span>
              <span className="text-muted-foreground/70">({count})</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
