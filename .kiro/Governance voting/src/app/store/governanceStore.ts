import { create } from 'zustand';

export type ProposalStatus = 'Active' | 'Succeeded' | 'Defeated' | 'Executed';
export type VoteChoice = 'For' | 'Against' | 'Abstain';

export interface Vote {
  proposalId: string;
  choice: VoteChoice;
  votingPower: number;
  timestamp: number;
  signature?: string;
}

export interface Proposal {
  id: string;
  title: string;
  description: string;
  humanSummary: string;
  status: ProposalStatus;
  category: 'Climate-Resilient Grant' | 'Interest Rate Model';
  startTime: number;
  endTime: number;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  quorum: number;
  actionButtons: {
    approve: string;
    reject: string;
  };
}

interface VoterInfluence {
  farmerInfluence: number;
  investorInfluence: number;
  totalVotingPower: number;
  participationRate: number;
}

interface GovernanceStore {
  proposals: Proposal[];
  userVotes: Vote[];
  voterInfluence: VoterInfluence;
  castVote: (proposalId: string, choice: VoteChoice) => Promise<void>;
  fetchProposals: () => Promise<void>;
  getProposalStatus: (proposalId: string) => ProposalStatus | null;
}

// Mock EIP-712 signature generation
const generateEIP712Signature = async (
  proposalId: string,
  choice: VoteChoice
): Promise<string> => {
  // Simulate gasless vote signature
  await new Promise((resolve) => setTimeout(resolve, 500));
  return `0x${Math.random().toString(16).substring(2, 66)}`;
};

export const useGovernanceStore = create<GovernanceStore>((set, get) => ({
  proposals: [
    {
      id: 'prop-001',
      title: 'Fund Regenerative Agriculture in Southeast Asia',
      description:
        'Allocate 500,000 USDC to support smallholder farmers adopting regenerative practices in Vietnam and Thailand.',
      humanSummary:
        'Give $500k to farmers in Vietnam & Thailand who want to switch to eco-friendly farming methods.',
      status: 'Active',
      category: 'Climate-Resilient Grant',
      startTime: Date.now() - 2 * 24 * 60 * 60 * 1000,
      endTime: Date.now() + 5 * 24 * 60 * 60 * 1000,
      forVotes: 1250000,
      againstVotes: 340000,
      abstainVotes: 110000,
      quorum: 1000000,
      actionButtons: {
        approve: 'Fund This Grant',
        reject: 'Reject Funding',
      },
    },
    {
      id: 'prop-002',
      title: 'Reduce Borrowing Rates for Climate Projects',
      description:
        'Decrease the annual interest rate from 8.5% to 6.2% for loans supporting climate adaptation infrastructure.',
      humanSummary:
        'Lower loan interest from 8.5% to 6.2% for people building climate-friendly infrastructure.',
      status: 'Active',
      category: 'Interest Rate Model',
      startTime: Date.now() - 1 * 24 * 60 * 60 * 1000,
      endTime: Date.now() + 6 * 24 * 60 * 60 * 1000,
      forVotes: 890000,
      againstVotes: 670000,
      abstainVotes: 45000,
      quorum: 1000000,
      actionButtons: {
        approve: 'Approve Lower Rates',
        reject: 'Keep Current Rates',
      },
    },
    {
      id: 'prop-003',
      title: 'Extend Carbon Credit Rewards Program',
      description:
        'Extend the existing carbon credit rewards program for an additional 12 months with a budget increase of 15%.',
      humanSummary:
        'Keep paying farmers carbon credits for another year, with 15% more budget.',
      status: 'Succeeded',
      category: 'Climate-Resilient Grant',
      startTime: Date.now() - 10 * 24 * 60 * 60 * 1000,
      endTime: Date.now() - 3 * 24 * 60 * 60 * 1000,
      forVotes: 2100000,
      againstVotes: 450000,
      abstainVotes: 200000,
      quorum: 1000000,
      actionButtons: {
        approve: 'Approve Extension',
        reject: 'Reject Extension',
      },
    },
    {
      id: 'prop-004',
      title: 'Update Risk Parameters for Volatile Assets',
      description:
        'Adjust liquidation thresholds and loan-to-value ratios for volatile crypto assets used as collateral.',
      humanSummary:
        'Make it safer to lend by changing when we liquidate risky cryptocurrency collateral.',
      status: 'Executed',
      category: 'Interest Rate Model',
      startTime: Date.now() - 20 * 24 * 60 * 60 * 1000,
      endTime: Date.now() - 15 * 24 * 60 * 60 * 1000,
      forVotes: 1800000,
      againstVotes: 320000,
      abstainVotes: 130000,
      quorum: 1000000,
      actionButtons: {
        approve: 'Approve Changes',
        reject: 'Keep Current Parameters',
      },
    },
  ],
  userVotes: [],
  voterInfluence: {
    farmerInfluence: 3250,
    investorInfluence: 8900,
    totalVotingPower: 12150,
    participationRate: 68,
  },
  castVote: async (proposalId: string, choice: VoteChoice) => {
    const { voterInfluence, userVotes } = get();

    // Generate EIP-712 signature for gasless voting
    const signature = await generateEIP712Signature(proposalId, choice);

    const vote: Vote = {
      proposalId,
      choice,
      votingPower: voterInfluence.totalVotingPower,
      timestamp: Date.now(),
      signature,
    };

    // Update local state
    set((state) => ({
      userVotes: [...state.userVotes, vote],
      proposals: state.proposals.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              forVotes:
                choice === 'For'
                  ? p.forVotes + vote.votingPower
                  : p.forVotes,
              againstVotes:
                choice === 'Against'
                  ? p.againstVotes + vote.votingPower
                  : p.againstVotes,
              abstainVotes:
                choice === 'Abstain'
                  ? p.abstainVotes + vote.votingPower
                  : p.abstainVotes,
            }
          : p
      ),
    }));
  },
  fetchProposals: async () => {
    // Mock API call to Snapshot or OpenZeppelin Governor
    await new Promise((resolve) => setTimeout(resolve, 800));
    // In production, this would fetch from Snapshot API or chain
  },
  getProposalStatus: (proposalId: string) => {
    const proposal = get().proposals.find((p) => p.id === proposalId);
    return proposal?.status ?? null;
  },
}));
