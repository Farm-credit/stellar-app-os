'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ProposalStatus, formatVotingTimeRemaining, calculateVotePercentage } from '@/lib/stellar/species-voting';
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
/**
 * ProposalList — Species voting dashboard (#663)
 *
 * Displays active proposals with:
 *  - Species details (name, slug, CO₂ sequestration, maturity)
 *  - Vote percentages rendered with Progress bar
 *  - Remaining campaign timeline
 *  - Vote buttons that trigger wallet signature (pending → confirmed / failed)
 */

import { useState, useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useWalletContext } from '@/contexts/WalletContext';
import {
  ProposalStatus,
  formatVotingTimeRemaining,
  calculateVotePercentage,
  buildVoteTransaction,
  buildExecuteProposalTransaction,
  type ProposalRecord,
} from '@/lib/stellar/species-voting';
import {
  ThumbsUp,
  ThumbsDown,
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
  TreePine,
  Leaf,
  AlertCircle,
  Loader2,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

type VoteState =
  | { status: 'idle' }
  | { status: 'signing'; direction: boolean }
  | { status: 'confirmed'; direction: boolean }
  | { status: 'failed'; error: string };

// ── Mock data ──────────────────────────────────────────────────────────────
// Replace with on-chain query once the contract is deployed.

const mockProposals: ProposalRecord[] = [
  {
    id: 1,
    slug: 'mahogany',
    name: 'Mahogany',
    co2_scaled: 2500n,
    maturity_years: 25,
    proposer: 'GABCD...',
    votes_for: 750000,
    votes_against: 50000,
    proposer: 'GABCD1234EFGH5678IJKL9012MNOP3456QRST7890UVWX1234YZ56',
    votes_for: 750_000n,
    votes_against: 50_000n,
    status: ProposalStatus.Active,
    created_at: Date.now() / 1000 - 86400 * 2,
    voting_ends_at: Date.now() / 1000 + 86400 * 5,
  },
  {
    id: 2,
    slug: 'iroko',
    name: 'Iroko',
    co2_scaled: 3400n,
    maturity_years: 40,
    proposer: 'GXYZ9876ABCD5432EFGH1098IJKL7654MNOP3210QRST9876UVWX',
    votes_for: 320_000n,
    votes_against: 280_000n,
    status: ProposalStatus.Active,
    created_at: Date.now() / 1000 - 86400 * 1,
    voting_ends_at: Date.now() / 1000 + 86400 * 6,
  },
  {
    id: 3,
    slug: 'oak',
    name: 'Oak',
    co2_scaled: 3000n,
    maturity_years: 30,
    proposer: 'GXYZ...',
    votes_for: 1200000,
    votes_against: 100000,
    proposer: 'GXYZ9876ABCD5432EFGH1098IJKL7654MNOP3210QRST9876UVWX',
    votes_for: 1_200_000n,
    votes_against: 100_000n,
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
                  <span className="ml-2 font-medium">{(proposal.co2_scaled / 100).toFixed(2)} kg/year</span>
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
                <Progress value={calculateVotePercentage(proposal.votes_for, proposal.votes_against)} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{calculateVotePercentage(proposal.votes_for, proposal.votes_against).toFixed(1)}% in favor</span>
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
// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProposalStatus }) {
  const configs = {
    [ProposalStatus.Active]: {
      icon: <PlayCircle className="h-3 w-3" />,
      label: 'Active',
      className: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
    },
    [ProposalStatus.Passed]: {
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: 'Passed',
      className: 'border-green-500/40 bg-green-500/10 text-green-400',
    },
    [ProposalStatus.Rejected]: {
      icon: <XCircle className="h-3 w-3" />,
      label: 'Rejected',
      className: 'border-red-500/40 bg-red-500/10 text-red-400',
    },
    [ProposalStatus.Executed]: {
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: 'Executed',
      className: 'border-gray-500/40 bg-gray-500/10 text-gray-400',
    },
  };

  const config = configs[status];
  return (
    <Badge variant="outline" className={cn('gap-1 text-xs font-medium', config.className)}>
      {config.icon}
      {config.label}
    </Badge>
  );
}

// ── Single proposal card ───────────────────────────────────────────────────

interface ProposalCardProps {
  proposal: ProposalRecord;
  voteState: VoteState;
  hasVoted: boolean;
  onVote: (proposalId: number, voteFor: boolean) => Promise<void>;
  onExecute: (proposalId: number) => Promise<void>;
}

function ProposalCard({ proposal, voteState, hasVoted, onVote, onExecute }: ProposalCardProps) {
  const votePercent = calculateVotePercentage(proposal.votes_for, proposal.votes_against);
  const totalVotes = proposal.votes_for + proposal.votes_against;
  const isSigning = voteState.status === 'signing';
  const isActive = proposal.status === ProposalStatus.Active;

  return (
    <Card className="border-white/10 bg-white/[0.03] transition-colors hover:bg-white/[0.05]">
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <TreePine className="h-4 w-4 shrink-0 text-green-400" aria-hidden="true" />
              <span className="text-white">{proposal.name}</span>
              <span className="text-sm font-normal text-white/40">/{proposal.slug}</span>
            </CardTitle>
            <CardDescription className="mt-1 font-mono text-[11px] text-white/30 truncate">
              Proposed by {proposal.proposer.slice(0, 8)}…{proposal.proposer.slice(-6)}
            </CardDescription>
          </div>
          <StatusBadge status={proposal.status} />
        </div>
      </CardHeader>

      {/* Carbon metrics */}
      <CardContent className="space-y-4 pb-3">
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/8 bg-white/[0.02] p-3">
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[11px] text-white/40 uppercase tracking-wider">
              <Leaf className="h-3 w-3 text-green-400" aria-hidden="true" />
              CO₂ / year
            </span>
            <span className="text-sm font-semibold text-green-400">
              {(Number(proposal.co2_scaled) / 100).toFixed(2)} kg
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-white/40 uppercase tracking-wider">Maturity</span>
            <span className="text-sm font-semibold text-white">{proposal.maturity_years} yrs</span>
          </div>
        </div>

        {/* Vote distribution */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-green-400 font-medium">
              <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
              {Number(proposal.votes_for).toLocaleString()} for
            </span>
            <span className="text-white/40 text-[11px]">
              {totalVotes > 0n ? `${Number(totalVotes).toLocaleString()} total` : 'No votes yet'}
            </span>
            <span className="flex items-center gap-1.5 text-red-400 font-medium">
              {Number(proposal.votes_against).toLocaleString()} against
              <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>

          <Progress
            value={votePercent}
            aria-label={`${votePercent.toFixed(1)}% votes in favour`}
            className="h-2.5 bg-red-500/20"
          />

          <div className="flex items-center justify-between text-[11px] text-white/40">
            <span className="font-medium text-green-400/80">
              {votePercent.toFixed(1)}% in favour
            </span>
            {isActive && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {formatVotingTimeRemaining(proposal.voting_ends_at)}
              </span>
            )}
          </div>
        </div>

        {/* Vote transaction feedback */}
        {voteState.status === 'confirmed' && (
          <Alert className="border-green-500/30 bg-green-500/10 py-2">
            <CheckCircle2 className="h-4 w-4 text-green-400" aria-hidden="true" />
            <AlertDescription className="text-green-300 text-xs">
              Vote submitted and signed successfully.
            </AlertDescription>
          </Alert>
        )}
        {voteState.status === 'failed' && (
          <Alert className="border-red-500/30 bg-red-500/10 py-2" role="alert">
            <AlertCircle className="h-4 w-4 text-red-400" aria-hidden="true" />
            <AlertDescription className="text-red-300 text-xs">{voteState.error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      {/* Footer actions */}
      <CardFooter className="pt-0">
        {isActive && !hasVoted && voteState.status !== 'confirmed' && (
          <div className="flex w-full gap-2">
            <Button
              variant="default"
              onClick={() => onVote(proposal.id, true)}
              disabled={isSigning}
              aria-busy={isSigning && (voteState as { direction: boolean }).direction === true}
              className="flex-1 bg-green-600 hover:bg-green-500 text-white border-0"
            >
              {isSigning && (voteState as { direction: boolean }).direction === true ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  Signing…
                </>
              ) : (
                <>
                  <ThumbsUp className="h-4 w-4 mr-2" aria-hidden="true" />
                  Vote For
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => onVote(proposal.id, false)}
              disabled={isSigning}
              aria-busy={isSigning && (voteState as { direction: boolean }).direction === false}
              className="flex-1 border-red-500/40 text-red-400 hover:bg-red-500/10"
            >
              {isSigning && (voteState as { direction: boolean }).direction === false ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  Signing…
                </>
              ) : (
                <>
                  <ThumbsDown className="h-4 w-4 mr-2" aria-hidden="true" />
                  Vote Against
                </>
              )}
            </Button>
          </div>
        )}

        {isActive && hasVoted && voteState.status !== 'confirmed' && (
          <Badge variant="outline" className="border-white/20 text-white/50 text-xs">
            You have voted on this proposal
          </Badge>
        )}

        {proposal.status === ProposalStatus.Passed && (
          <Button onClick={() => onExecute(proposal.id)} disabled={isSigning} className="w-full">
            {isSigning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Signing…
              </>
            ) : (
              'Execute Proposal'
            )}
          </Button>
        )}

        {(proposal.status === ProposalStatus.Rejected ||
          proposal.status === ProposalStatus.Executed) && (
          <span className="text-xs text-white/30">
            {proposal.status === ProposalStatus.Executed
              ? 'Species has been added to the catalogue.'
              : 'This proposal did not pass.'}
          </span>
        )}
      </CardFooter>
    </Card>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ProposalList() {
  const { wallet, signTransaction } = useWalletContext();
  const [proposals] = useState<ProposalRecord[]>(mockProposals);
  const [votedProposals, setVotedProposals] = useState<Set<number>>(new Set());
  const [voteStates, setVoteStates] = useState<Record<number, VoteState>>({});

  const setVoteState = (id: number, state: VoteState) =>
    setVoteStates((prev) => ({ ...prev, [id]: state }));

  const getVoteState = (id: number): VoteState => voteStates[id] ?? { status: 'idle' };

  // ── Vote handler ─────────────────────────────────────────────────────────

  const handleVote = useCallback(
    async (proposalId: number, voteFor: boolean) => {
      if (!wallet?.publicKey) {
        setVoteState(proposalId, {
          status: 'failed',
          error: 'Connect your wallet before voting.',
        });
        return;
      }

      setVoteState(proposalId, { status: 'signing', direction: voteFor });

      try {
        const { transactionXdr, networkPassphrase } = await buildVoteTransaction(
          wallet.publicKey,
          proposalId,
          voteFor,
          wallet.network
        );

        // Trigger wallet signature popup
        const _signedXdr = await signTransaction(transactionXdr, networkPassphrase);

        // TODO: Submit signedXdr to Horizon for broadcasting
        // await server.submitTransaction(TransactionBuilder.fromXDR(signedXdr, networkPassphrase));

        setVotedProposals((prev) => new Set([...prev, proposalId]));
        setVoteState(proposalId, { status: 'confirmed', direction: voteFor });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to submit vote';
        const isRejection =
          msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('cancel');
        setVoteState(proposalId, {
          status: 'failed',
          error: isRejection ? 'Transaction cancelled. Your vote was not submitted.' : msg,
        });
      }
    },
    [wallet, signTransaction]
  );

  // ── Execute handler ──────────────────────────────────────────────────────

  const handleExecute = useCallback(
    async (proposalId: number) => {
      if (!wallet?.publicKey) {
        setVoteState(proposalId, {
          status: 'failed',
          error: 'Connect your wallet to execute this proposal.',
        });
        return;
      }

      setVoteState(proposalId, { status: 'signing', direction: true });

      try {
        const { transactionXdr, networkPassphrase } = await buildExecuteProposalTransaction(
          wallet.publicKey,
          proposalId,
          wallet.network
        );

        const _signedXdr = await signTransaction(transactionXdr, networkPassphrase);
        // TODO: Submit to Horizon
        setVoteState(proposalId, { status: 'confirmed', direction: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to execute proposal';
        setVoteState(proposalId, { status: 'failed', error: msg });
      }
    },
    [wallet, signTransaction]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <TreePine className="h-10 w-10 text-white/20" aria-hidden="true" />
        <p className="text-sm text-white/40">
          No proposals yet. Be the first to propose a new species!
        </p>
      </div>
    );
  }

  // Wallet not connected notice
  const walletNotice = !wallet?.publicKey && (
    <Alert className="border-amber-500/30 bg-amber-500/10 mb-4">
      <AlertCircle className="h-4 w-4 text-amber-400" aria-hidden="true" />
      <AlertDescription className="text-amber-300 text-sm">
        Connect your wallet to cast votes. Your voting power is proportional to your TREE token
        holdings.
      </AlertDescription>
    </Alert>
  );

  return (
    <div className="space-y-4">
      {walletNotice}
      {proposals.map((proposal) => (
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          voteState={getVoteState(proposal.id)}
          hasVoted={votedProposals.has(proposal.id)}
          onVote={handleVote}
          onExecute={handleExecute}
        />
      ))}
    </div>
  );
}
