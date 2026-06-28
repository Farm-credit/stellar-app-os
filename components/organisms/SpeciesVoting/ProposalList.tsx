'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  ProposalStatus,
  formatVotingTimeRemaining,
  calculateVotePercentage,
} from '@/lib/stellar/species-voting';
import { ThumbsUp, ThumbsDown, Clock, CheckCircle2, XCircle, PlayCircle } from 'lucide-react';

interface Proposal {
  id: number;
  slug: string;
  name: string;
  co2_scaled: number;
  maturity_years: number;
  proposer: string;
  votes_for: number;
  votes_against: number;
  status: ProposalStatus;
  created_at: number;
  voting_ends_at: number;
}

const mockProposals: Proposal[] = [
  {
    id: 1,
    slug: 'mahogany',
    name: 'Mahogany',
    co2_scaled: 2500,
    maturity_years: 25,
    proposer: 'GABCD...',
    votes_for: 750000,
    votes_against: 50000,
    status: ProposalStatus.Active,
    created_at: Date.now() / 1000 - 86400 * 2,
    voting_ends_at: Date.now() / 1000 + 86400 * 5,
  },
  {
    id: 2,
    slug: 'oak',
    name: 'Oak',
    co2_scaled: 3000,
    maturity_years: 30,
    proposer: 'GXYZ...',
    votes_for: 1200000,
    votes_against: 100000,
    status: ProposalStatus.Passed,
    created_at: Date.now() / 1000 - 86400 * 10,
    voting_ends_at: Date.now() / 1000 - 86400 * 3,
  },
];

export function ProposalList() {
  const [proposals] = useState<Proposal[]>(mockProposals);
  const [votedProposals, setVotedProposals] = useState<Set<number>>(new Set());

  const handleVote = (proposalId: number, voteFor: boolean) => {
    setVotedProposals((prev) => new Set([...prev, proposalId]));
    // TODO: Submit vote transaction
    console.log(`Voting ${voteFor ? 'for' : 'against'} proposal ${proposalId}`);
  };

  const handleExecute = (proposalId: number) => {
    // TODO: Submit execute transaction
    console.log(`Executing proposal ${proposalId}`);
  };

  const getStatusBadge = (status: ProposalStatus) => {
    switch (status) {
      case ProposalStatus.Active:
        return (
          <Badge variant="outline" className="gap-1">
            <PlayCircle className="h-3 w-3" />
            Active
          </Badge>
        );
      case ProposalStatus.Passed:
        return (
          <Badge variant="default" className="gap-1 bg-green-600">
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
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Executed
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-4">
      {proposals.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No proposals yet. Be the first to propose a new species!
        </div>
      ) : (
        proposals.map((proposal) => (
          <Card key={proposal.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {proposal.name}
                    <span className="text-sm font-normal text-muted-foreground">
                      ({proposal.slug})
                    </span>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Proposed by {proposal.proposer}
                  </CardDescription>
                </div>
                {getStatusBadge(proposal.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">CO₂ Sequestration:</span>
                  <span className="ml-2 font-medium">
                    {(proposal.co2_scaled / 100).toFixed(2)} kg/year
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Maturity:</span>
                  <span className="ml-2 font-medium">{proposal.maturity_years} years</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <ThumbsUp className="h-4 w-4 text-green-600" />
                    {proposal.votes_for.toLocaleString()} votes
                  </span>
                  <span className="flex items-center gap-2">
                    {proposal.votes_against.toLocaleString()} votes
                    <ThumbsDown className="h-4 w-4 text-red-600" />
                  </span>
                </div>
                <Progress
                  value={calculateVotePercentage(proposal.votes_for, proposal.votes_against)}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {calculateVotePercentage(proposal.votes_for, proposal.votes_against).toFixed(1)}
                    % in favor
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatVotingTimeRemaining(proposal.voting_ends_at)}
                  </span>
                </div>
              </div>
            </CardContent>
            {proposal.status === ProposalStatus.Active && !votedProposals.has(proposal.id) && (
              <CardFooter className="gap-2">
                <Button
                  variant="default"
                  onClick={() => handleVote(proposal.id, true)}
                  className="flex-1"
                >
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  Vote For
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleVote(proposal.id, false)}
                  className="flex-1"
                >
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  Vote Against
                </Button>
              </CardFooter>
            )}
            {proposal.status === ProposalStatus.Active && votedProposals.has(proposal.id) && (
              <CardFooter>
                <Badge variant="secondary">You have voted on this proposal</Badge>
              </CardFooter>
            )}
            {proposal.status === ProposalStatus.Passed && (
              <CardFooter>
                <Button onClick={() => handleExecute(proposal.id)} className="w-full">
                  Execute Proposal
                </Button>
              </CardFooter>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
