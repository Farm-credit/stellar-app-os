export type VoteOption = 'for' | 'against' | 'abstain';
export type ProposalStatus = 'active' | 'passed' | 'rejected' | 'pending';

export interface VoteTally {
  for: number;
  against: number;
  abstain: number;
}

export interface ProposalDetailCardProps {
  proposalId: string;
  title: string;
  description: string;
  proposer: string;
  status: ProposalStatus;
  votes: VoteTally;
  totalVoters: number;
  deadline: string;
  onVote?: (proposalId: string, option: VoteOption) => void;
  userVote?: VoteOption | null;
  className?: string;
}
