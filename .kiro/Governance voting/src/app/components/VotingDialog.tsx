import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'motion/react';
import { X, Vote, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Proposal, VoteChoice } from '../store/governanceStore';

interface VotingDialogProps {
  proposal: Proposal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVote: (proposalId: string, choice: VoteChoice) => Promise<void>;
  userVotingPower: number;
}

export function VotingDialog({
  proposal,
  open,
  onOpenChange,
  onVote,
  userVotingPower,
}: VotingDialogProps) {
  const [selectedChoice, setSelectedChoice] = useState<VoteChoice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [voteSubmitted, setVoteSubmitted] = useState(false);

  const handleVote = async () => {
    if (!selectedChoice) return;

    setIsSubmitting(true);
    try {
      await onVote(proposal.id, selectedChoice);
      setVoteSubmitted(true);
      setTimeout(() => {
        onOpenChange(false);
        setVoteSubmitted(false);
        setSelectedChoice(null);
      }, 2000);
    } catch (error) {
      console.error('Vote failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
  const forPercentage = totalVotes > 0 ? (proposal.forVotes / totalVotes) * 100 : 0;
  const againstPercentage = totalVotes > 0 ? (proposal.againstVotes / totalVotes) * 100 : 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
          />
        </Dialog.Overlay>
        <Dialog.Content asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto z-50"
          >
            <AnimatePresence mode="wait">
              {!voteSubmitted ? (
                <motion.div
                  key="voting-form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-6"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                        <Vote className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <Dialog.Title className="text-xl font-semibold text-gray-900">
                          Cast Your Vote
                        </Dialog.Title>
                        <p className="text-sm text-gray-500 mt-0.5">
                          Gasless voting via EIP-712 signature
                        </p>
                      </div>
                    </div>
                    <Dialog.Close asChild>
                      <button className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                      </button>
                    </Dialog.Close>
                  </div>

                  {/* Proposal Info */}
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">{proposal.title}</h4>
                    <div className="mb-3">
                      <p className="text-sm text-gray-600 mb-2">
                        Summary for Humans:
                      </p>
                      <p className="text-sm text-gray-800 bg-white p-3 rounded border border-gray-200">
                        {proposal.humanSummary}
                      </p>
                    </div>
                    <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                      {proposal.category}
                    </span>
                  </div>

                  {/* Current Results */}
                  <div className="mb-6">
                    <h5 className="text-sm font-medium text-gray-700 mb-3">
                      Current Results
                    </h5>
                    <div className="space-y-2">
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-600">For</span>
                          <span className="font-medium text-gray-900">
                            {proposal.forVotes.toLocaleString()} ({forPercentage.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-green-500 h-full rounded-full"
                            style={{ width: `${forPercentage}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-600">Against</span>
                          <span className="font-medium text-gray-900">
                            {proposal.againstVotes.toLocaleString()} ({againstPercentage.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-red-500 h-full rounded-full"
                            style={{ width: `${againstPercentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Vote Choices */}
                  <div className="mb-6">
                    <h5 className="text-sm font-medium text-gray-700 mb-3">
                      Your Choice
                    </h5>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setSelectedChoice('For')}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          selectedChoice === 'For'
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-200 hover:border-green-300'
                        }`}
                      >
                        <p className="font-medium text-gray-900 mb-1">
                          {proposal.actionButtons.approve}
                        </p>
                        <p className="text-xs text-gray-500">Vote For</p>
                      </button>
                      <button
                        onClick={() => setSelectedChoice('Against')}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          selectedChoice === 'Against'
                            ? 'border-red-500 bg-red-50'
                            : 'border-gray-200 hover:border-red-300'
                        }`}
                      >
                        <p className="font-medium text-gray-900 mb-1">
                          {proposal.actionButtons.reject}
                        </p>
                        <p className="text-xs text-gray-500">Vote Against</p>
                      </button>
                    </div>
                    <button
                      onClick={() => setSelectedChoice('Abstain')}
                      className={`w-full mt-3 p-3 rounded-lg border-2 transition-all ${
                        selectedChoice === 'Abstain'
                          ? 'border-gray-500 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-medium text-gray-900 text-sm">Abstain</p>
                    </button>
                  </div>

                  {/* Voting Power Display */}
                  <div className="mb-6 p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-purple-800">
                        Your Voting Power
                      </span>
                      <span className="font-semibold text-purple-900">
                        {userVotingPower.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <Dialog.Close asChild>
                      <button className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                        Cancel
                      </button>
                    </Dialog.Close>
                    <button
                      onClick={handleVote}
                      disabled={!selectedChoice || isSubmitting}
                      className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                          />
                          Signing...
                        </>
                      ) : (
                        'Submit Vote'
                      )}
                    </button>
                  </div>

                  {/* Info */}
                  <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-blue-800">
                      This is a gasless vote using EIP-712 signatures. You won't pay any gas fees.
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-8 flex flex-col items-center justify-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', duration: 0.5 }}
                    className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4"
                  >
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </motion.div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Vote Submitted!
                  </h3>
                  <p className="text-sm text-gray-600 text-center">
                    Your {selectedChoice} vote has been recorded with {userVotingPower.toLocaleString()} voting power.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
