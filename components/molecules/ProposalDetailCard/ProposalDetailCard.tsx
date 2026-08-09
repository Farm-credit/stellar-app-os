'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';
import { CountdownTimer } from './CountdownTimer';
import { VoteProgressBar } from './VoteProgressBar';
import type { ProposalDetailCardProps, VoteOption, ProposalStatus } from './types';

const statusConfig: Record<
  ProposalStatus,
  { label: string; variant: 'success' | 'destructive' | 'secondary' | 'default' }
> = {
  active: { label: 'Active', variant: 'default' },
  passed: { label: 'Passed', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  pending: { label: 'Pending', variant: 'secondary' },
};

type Props = ProposalDetailCardProps & HTMLAttributes<HTMLDivElement>;

const ProposalDetailCard = forwardRef<HTMLDivElement, Props>(
  (
    {
      proposalId,
      title,
      description,
      proposer,
      status,
      votes,
      totalVoters,
      deadline,
      onVote,
      userVote = null,
      className,
      ...rest
    },
    ref
  ) => {
    const { label: statusLabel, variant: statusVariant } = statusConfig[status];
    const isActive = status === 'active';
    const isPending = status === 'pending';

    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col gap-5 rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md',
          className
        )}
        data-slot="proposal-detail-card"
        {...rest}
      >
        <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold leading-tight truncate">{title}</h3>
              <Badge variant={statusVariant} className="shrink-0">
                {statusLabel}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Proposed by <span className="font-medium text-foreground">{proposer}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(isActive || isPending) && <CountdownTimer deadline={deadline} />}
            {status !== 'active' && status !== 'pending' && (
              <span className="text-sm text-muted-foreground">
                Ended {new Date(deadline).toLocaleDateString()}
              </span>
            )}
          </div>
        </header>

        <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">{description}</p>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Vote Progress</span>
            <span className="text-muted-foreground tabular-nums">
              {totalVoters} voter{totalVoters !== 1 ? 's' : ''}
            </span>
          </div>
          <VoteProgressBar votes={votes} />
        </div>

        <footer className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t pt-4">
          <div className="flex flex-wrap gap-2">
            {(['for', 'against', 'abstain'] as const).map((option) => {
              const isSelected = userVote === option;
              const labels: Record<VoteOption, string> = {
                for: 'Vote For',
                against: 'Vote Against',
                abstain: 'Abstain',
              };
              const stellarMap: Record<VoteOption, 'success' | 'accent' | 'primary-outline'> = {
                for: 'success',
                against: 'accent',
                abstain: 'primary-outline',
              };
              return (
                <Button
                  key={option}
                  stellar={stellarMap[option]}
                  size="sm"
                  disabled={!isActive || (userVote !== null && !isSelected)}
                  aria-pressed={isSelected}
                  onClick={() => onVote?.(proposalId, option)}
                  className={cn(
                    'transition-all',
                    isSelected && 'ring-2 ring-offset-2 ring-stellar-blue'
                  )}
                >
                  {labels[option]}
                </Button>
              );
            })}
          </div>
          <span className="text-xs text-muted-foreground">ID: {proposalId}</span>
        </footer>
      </div>
    );
  }
);
ProposalDetailCard.displayName = 'ProposalDetailCard';

export { ProposalDetailCard };
export type { ProposalDetailCardProps, VoteOption, ProposalStatus };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VoteTally = any;
