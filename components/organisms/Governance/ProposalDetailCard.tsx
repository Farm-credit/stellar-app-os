'use client';

import { type JSX, useState, useEffect } from 'react';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';
import {
  ProposalStatus,
  formatVotingTimeRemaining,
  calculateVotePercentage,
} from '@/lib/stellar/species-voting';
import {
  ThumbsUp,
  ThumbsDown,
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Proposal {
  id: number;
  slug: string;
  name: string;
  co2_scaled: number;
  maturity_years: number;
  description?: string;
  proposer: string;
  votes_for: number;
  votes_against: number;
  status: ProposalStatus;
  created_at: number;
  voting_ends_at: number;
}

interface ProposalDetailCardProps {
  proposal: Proposal;
  onVote?: (proposalId: number, voteFor: boolean) => Promise<void>;
  onExecute?: (proposalId: number) => Promise<void>;
  hasVoted?: boolean;
  isLoading?: boolean;
  variant?: 'default' | 'compact' | 'detailed';
  className?: string;
}

export function ProposalDetailCard({
  proposal,
  onVote,
  onExecute,
  hasVoted = false,
  isLoading = false,
  variant = 'default',
  className,
}: ProposalDetailCardProps): JSX.Element {
  const [localVoted, setLocalVoted] = useState(hasVoted);
  const [isVoting, setIsVoting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');

  useEffect(() => {
    setTimeRemaining(formatVotingTimeRemaining(proposal.voting_ends_at));

    const interval = setInterval(() => {
      setTimeRemaining(formatVotingTimeRemaining(proposal.voting_ends_at));
    }, 1000);

    return () => clearInterval(interval);
  }, [proposal.voting_ends_at]);

  const handleVote = async (voteFor: boolean) => {
    if (isVoting || !onVote) return;

    setIsVoting(true);
    try {
      await onVote(proposal.id, voteFor);
      setLocalVoted(true);
    } catch (error) {
      console.error('Vote failed:', error);
    } finally {
      setIsVoting(false);
    }
  };

  const handleExecute = async () => {
    if (isExecuting || !onExecute) return;

    setIsExecuting(true);
    try {
      await onExecute(proposal.id);
    } catch (error) {
      console.error('Execute failed:', error);
    } finally {
      setIsExecuting(false);
    }
  };

  const votePercentage = calculateVotePercentage(proposal.votes_for, proposal.votes_against);

  const getStatusBadge = (): JSX.Element => {
    switch (proposal.status) {
      case ProposalStatus.Active:
        return (
          <Badge variant="outline" className="gap-1 bg-green-50 border-green-200 text-green-700">
            <PlayCircle className="h-3 w-3" />
            Active
          </Badge>
        );
      case ProposalStatus.Passed:
        return (
          <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="h-3 w-3" />
            Passed
          </Badge>
        );
      case ProposalStatus.Rejected:
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Rejected
          </Badge>
        );
      case ProposalStatus.Executed:
        return (
          <Badge variant="secondary" className="gap-1 bg-blue-600 hover:bg-blue-700">
            <CheckCircle2 className="h-3 w-3" />
            Executed
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md',
        variant === 'compact' && 'p-4',
        variant === 'detailed' && 'p-8',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-semibold tracking-tight">{proposal.name}</h3>
            {getStatusBadge()}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{proposal.slug}</span>
            <span>•</span>
            <span>Proposed by {proposal.proposer}</span>
          </div>
        </div>
      </div>

      {/* Description */}
      {variant === 'detailed' && proposal.description && (
        <p className="text-sm text-muted-foreground mb-4">{proposal.description}</p>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl bg-muted/50 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <span className="font-medium">CO₂ Sequestration</span>
          </div>
          <p className="text-lg font-semibold text-green-600">
            {(proposal.co2_scaled / 100).toFixed(2)} kg/year
          </p>
        </div>
        <div className="rounded-xl bg-muted/50 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <span className="font-medium">Maturity Period</span>
          </div>
          <p className="text-lg font-semibold text-blue-600">{proposal.maturity_years} years</p>
        </div>
      </div>

      {/* Voting Progress */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200">
              <ThumbsUp className="h-4 w-4 text-green-600" />
              <span className="font-semibold text-green-700">
                {proposal.votes_for.toLocaleString()}
              </span>
              <span className="text-muted-foreground text-xs">votes</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200">
              <span className="font-semibold text-red-700">
                {proposal.votes_against.toLocaleString()}
              </span>
              <span className="text-muted-foreground text-xs">votes</span>
              <ThumbsDown className="h-4 w-4 text-red-600" />
            </div>
          </div>
        </div>

        <div className="relative h-3 rounded-full overflow-hidden bg-muted">
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
            style={{ width: `${votePercentage}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-green-600">
            {votePercentage.toFixed(1)}% in favor
          </span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span className={cn(timeRemaining.includes('ended') && 'text-red-600')}>
              {timeRemaining}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {proposal.status === ProposalStatus.Active && !localVoted && (
        <div className="flex gap-3">
          <Button
            variant="default"
            onClick={() => handleVote(true)}
            disabled={isVoting}
            className="flex-1 bg-green-600 hover:bg-green-700"
            aria-label={`Vote for ${proposal.name}`}
          >
            {isVoting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ThumbsUp className="h-4 w-4 mr-2" />
            )}
            Vote For
          </Button>
          <Button
            variant="outline"
            onClick={() => handleVote(false)}
            disabled={isVoting}
            className="flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            aria-label={`Vote against ${proposal.name}`}
          >
            {isVoting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ThumbsDown className="h-4 w-4 mr-2" />
            )}
            Vote Against
          </Button>
        </div>
      )}

      {proposal.status === ProposalStatus.Active && localVoted && (
        <div className="flex items-center justify-center py-3 px-4 rounded-lg bg-muted/50">
          <Badge variant="secondary" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            You have voted on this proposal
          </Badge>
        </div>
      )}

      {proposal.status === ProposalStatus.Passed && (
        <Button
          onClick={handleExecute}
          disabled={isExecuting}
          className="w-full bg-blue-600 hover:bg-blue-700"
          aria-label={`Execute proposal ${proposal.name}`}
        >
          {isExecuting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          Execute Proposal
        </Button>
      )}
    </div>
  );
}
