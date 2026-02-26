import { useState } from 'react';
import { motion } from 'motion/react';
import { Sprout, Filter, RefreshCw } from 'lucide-react';
import { useGovernanceStore } from './store/governanceStore';
import { ProposalCard } from './components/ProposalCard';
import { VoterWeightCard } from './components/VoterWeightCard';
import { VotingDialog } from './components/VotingDialog';
import type { Proposal } from './store/governanceStore';

export default function App() {
  const { proposals, voterInfluence, castVote, userVotes } = useGovernanceStore();
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Closed'>('All');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filteredProposals = proposals.filter((proposal) => {
    if (filterStatus === 'All') return true;
    if (filterStatus === 'Active') return proposal.status === 'Active';
    return proposal.status === 'Succeeded' || proposal.status === 'Executed';
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsRefreshing(false);
  };

  const hasUserVoted = (proposalId: string) => {
    return userVotes.some((vote) => vote.proposalId === proposalId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ rotate: 0 }}
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center"
              >
                <Sprout className="w-6 h-6 text-white" />
              </motion.div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Climate-Resilient Governance
                </h1>
                <p className="text-sm text-gray-600">
                  Empowering farmers and investors to shape our future
                </p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
              />
              <span className="text-sm">Refresh</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Voter Stats */}
          <div className="lg:col-span-1 space-y-6">
            <VoterWeightCard
              farmerInfluence={voterInfluence.farmerInfluence}
              investorInfluence={voterInfluence.investorInfluence}
              totalVotingPower={voterInfluence.totalVotingPower}
              participationRate={voterInfluence.participationRate}
            />

            {/* Quick Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm"
            >
              <h3 className="font-semibold text-gray-900 mb-4">Quick Stats</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total Proposals</span>
                  <span className="font-semibold text-gray-900">
                    {proposals.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Active Proposals</span>
                  <span className="font-semibold text-blue-600">
                    {proposals.filter((p) => p.status === 'Active').length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Your Votes</span>
                  <span className="font-semibold text-purple-600">
                    {userVotes.length}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Info Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border border-purple-200 p-6"
            >
              <h3 className="font-semibold text-gray-900 mb-2">
                Gasless Voting
              </h3>
              <p className="text-sm text-gray-700">
                All votes are submitted using EIP-712 signatures. No gas fees required.
                Your vote is secured by cryptographic proof.
              </p>
            </motion.div>
          </div>

          {/* Right Column - Proposals */}
          <div className="lg:col-span-2">
            {/* Filter Bar */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Filter:</span>
                <div className="flex gap-2">
                  {(['All', 'Active', 'Closed'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setFilterStatus(status)}
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${
                        filterStatus === status
                          ? 'bg-purple-600 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-sm text-gray-500">
                {filteredProposals.length} proposal{filteredProposals.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Proposals List */}
            <div className="space-y-6">
              {filteredProposals.map((proposal, index) => (
                <motion.div
                  key={proposal.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                >
                  <ProposalCard
                    proposal={proposal}
                    onVoteClick={setSelectedProposal}
                    userHasVoted={hasUserVoted(proposal.id)}
                  />
                </motion.div>
              ))}
            </div>

            {filteredProposals.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <p className="text-gray-500">No proposals found</p>
              </motion.div>
            )}
          </div>
        </div>
      </main>

      {/* Voting Dialog */}
      {selectedProposal && (
        <VotingDialog
          proposal={selectedProposal}
          open={!!selectedProposal}
          onOpenChange={(open) => !open && setSelectedProposal(null)}
          onVote={castVote}
          userVotingPower={voterInfluence.totalVotingPower}
        />
      )}
    </div>
  );
}
