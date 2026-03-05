import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Calendar,
  Clock,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import * as Accordion from '@radix-ui/react-accordion';
import type { Proposal } from '../store/governanceStore';
import { ProposalTimeline } from './ProposalTimeline';

interface ProposalCardProps {
  proposal: Proposal;
  onVoteClick: (proposal: Proposal) => void;
  userHasVoted: boolean;
}

export function ProposalCard({
  proposal,
  onVoteClick,
  userHasVoted,
}: ProposalCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const totalVotes =
    proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
  const forPercentage = totalVotes > 0 ? (proposal.forVotes / totalVotes) * 100 : 0;
  const againstPercentage =
    totalVotes > 0 ? (proposal.againstVotes / totalVotes) * 100 : 0;
  const quorumPercentage = (totalVotes / proposal.quorum) * 100;

  const daysRemaining = Math.ceil(
    (proposal.endTime - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const isActive = proposal.status === 'Active';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={isActive ? { y: -4 } : {}}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`px-2 py-1 text-xs font-medium rounded ${
                  proposal.status === 'Active'
                    ? 'bg-blue-100 text-blue-700'
                    : proposal.status === 'Succeeded'
                    ? 'bg-green-100 text-green-700'
                    : proposal.status === 'Executed'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {proposal.status}
              </span>
              <span className="text-xs text-gray-500">{proposal.category}</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {proposal.title}
            </h3>
          </div>
        </div>

        {/* Summary for Humans */}
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-800 mb-1">
                Summary for Humans
              </p>
              <p className="text-sm text-amber-900">{proposal.humanSummary}</p>
            </div>
          </div>
        </div>

        {/* Voting Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-600">For</span>
            <span className="font-medium text-gray-900">
              {proposal.forVotes.toLocaleString()} ({forPercentage.toFixed(1)}%)
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-3 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${forPercentage}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="bg-green-500 h-full rounded-full"
            />
          </div>

          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-600">Against</span>
            <span className="font-medium text-gray-900">
              {proposal.againstVotes.toLocaleString()} ({againstPercentage.toFixed(1)}%)
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-3 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${againstPercentage}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
              className="bg-red-500 h-full rounded-full"
            />
          </div>

          {/* Quorum */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span>Quorum</span>
            </div>
            <span>
              {totalVotes.toLocaleString()} / {proposal.quorum.toLocaleString()} (
              {quorumPercentage.toFixed(0)}%)
            </span>
          </div>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
          {isActive && (
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>
                {daysRemaining > 0
                  ? `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left`
                  : 'Ending soon'}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            <span>
              {new Date(proposal.startTime).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>

        {/* Expandable Details */}
        <Accordion.Root
          type="single"
          collapsible
          value={isExpanded ? 'details' : ''}
          onValueChange={(value) => setIsExpanded(value === 'details')}
        >
          <Accordion.Item value="details">
            <Accordion.Trigger asChild>
              <button className="flex items-center justify-between w-full text-sm text-gray-600 hover:text-gray-900 transition-colors mb-4">
                <span className="font-medium">
                  {isExpanded ? 'Hide Details' : 'Show Details & Timeline'}
                </span>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </Accordion.Trigger>
            <Accordion.Content asChild>
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mb-4 pb-4 border-b border-gray-200">
                  <p className="text-sm text-gray-700 mb-4">
                    {proposal.description}
                  </p>
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-700 mb-3">
                      Proposal Lifecycle
                    </p>
                    <ProposalTimeline status={proposal.status} />
                  </div>
                </div>
              </motion.div>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>

        {/* Action Buttons */}
        {isActive && (
          <div className="flex gap-3">
            <button
              onClick={() => onVoteClick(proposal)}
              disabled={userHasVoted}
              className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {userHasVoted ? 'Vote Submitted' : 'Cast Your Vote'}
            </button>
          </div>
        )}

        {!isActive && (
          <div className="p-3 bg-gray-50 rounded-lg text-center">
            <p className="text-sm text-gray-600">
              {proposal.status === 'Executed'
                ? 'This proposal has been executed'
                : proposal.status === 'Succeeded'
                ? 'This proposal succeeded and is pending execution'
                : 'Voting has ended'}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
