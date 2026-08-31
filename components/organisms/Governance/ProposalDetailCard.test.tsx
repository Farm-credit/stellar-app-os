import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { ProposalDetailCard } from './ProposalDetailCard';
import { ProposalStatus } from '@/lib/stellar/species-voting';
import * as speciesVoting from '@/lib/stellar/species-voting';

// Mock the species-voting utilities
vi.mock('@/lib/stellar/species-voting', () => ({
  ProposalStatus: {
    Active: 'active',
    Passed: 'passed',
    Rejected: 'rejected',
    Executed: 'executed',
  },
  formatVotingTimeRemaining: vi.fn(() => '5 days remaining'),
  calculateVotePercentage: vi.fn(() => 93.75),
}));

describe('ProposalDetailCard', () => {
  const mockProposal = {
    id: 1,
    slug: 'mahogany',
    name: 'Mahogany',
    co2_scaled: 2500,
    maturity_years: 25,
    description: 'A fast-growing hardwood tree species',
    proposer: 'GABCD...',
    votes_for: 750000,
    votes_against: 50000,
    status: ProposalStatus.Active,
    created_at: Date.now() / 1000 - 86400 * 2,
    voting_ends_at: Date.now() / 1000 + 86400 * 5,
  };

  const mockOnVote = vi.fn();
  const mockOnExecute = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders proposal details correctly', () => {
    render(<ProposalDetailCard proposal={mockProposal} />);

    expect(screen.getByText('Mahogany')).toBeInTheDocument();
    expect(screen.getByText('mahogany')).toBeInTheDocument();
    expect(screen.getByText('Proposed by GABCD...')).toBeInTheDocument();
    expect(screen.getByText('25.00 kg/year')).toBeInTheDocument();
    expect(screen.getByText('25 years')).toBeInTheDocument();
  });

  it('displays vote counts and percentage', () => {
    render(<ProposalDetailCard proposal={mockProposal} />);

    expect(screen.getByText(/750,000/)).toBeInTheDocument();
    expect(screen.getByText(/50,000/)).toBeInTheDocument();
    expect(screen.getByText('93.8% in favor')).toBeInTheDocument();
  });

  it('shows countdown timer', () => {
    render(<ProposalDetailCard proposal={mockProposal} />);

    expect(screen.getByText('5 days remaining')).toBeInTheDocument();
  });

  it('displays active status badge', () => {
    render(<ProposalDetailCard proposal={mockProposal} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows voting buttons for active proposals when user has not voted', () => {
    render(<ProposalDetailCard proposal={mockProposal} onVote={mockOnVote} />);

    expect(screen.getByLabelText('Vote for Mahogany')).toBeInTheDocument();
    expect(screen.getByLabelText('Vote against Mahogany')).toBeInTheDocument();
  });

  it('calls onVote when Vote For button is clicked', () => {
    render(<ProposalDetailCard proposal={mockProposal} onVote={mockOnVote} />);

    const voteForButton = screen.getByLabelText('Vote for Mahogany');
    fireEvent.click(voteForButton);

    expect(mockOnVote).toHaveBeenCalledWith(1, true);
  });

  it('calls onVote when Vote Against button is clicked', () => {
    render(<ProposalDetailCard proposal={mockProposal} onVote={mockOnVote} />);

    const voteAgainstButton = screen.getByLabelText('Vote against Mahogany');
    fireEvent.click(voteAgainstButton);

    expect(mockOnVote).toHaveBeenCalledWith(1, false);
  });

  it('disables voting buttons while voting is in progress', () => {
    mockOnVote.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));
    render(<ProposalDetailCard proposal={mockProposal} onVote={mockOnVote} />);

    const voteForButton = screen.getByLabelText('Vote for Mahogany');
    const voteAgainstButton = screen.getByLabelText('Vote against Mahogany');

    fireEvent.click(voteForButton);

    expect(voteForButton).toBeDisabled();
    expect(voteAgainstButton).toBeDisabled();
  });

  it('shows voted state when user has already voted', () => {
    render(<ProposalDetailCard proposal={mockProposal} hasVoted={true} />);

    expect(screen.getByText('You have voted on this proposal')).toBeInTheDocument();
    expect(screen.queryByLabelText('Vote for Mahogany')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Vote against Mahogany')).not.toBeInTheDocument();
  });

  it('shows execute button for passed proposals', () => {
    const passedProposal = { ...mockProposal, status: ProposalStatus.Passed };
    render(<ProposalDetailCard proposal={passedProposal} onExecute={mockOnExecute} />);

    expect(screen.getByLabelText(/Execute proposal/)).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
  });

  it('calls onExecute when execute button is clicked', async () => {
    const passedProposal = { ...mockProposal, status: ProposalStatus.Passed };
    render(<ProposalDetailCard proposal={passedProposal} onExecute={mockOnExecute} />);

    const executeButton = screen.getByLabelText(/Execute proposal/);
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(mockOnExecute).toHaveBeenCalledWith(1);
    });
  });

  it('disables execute button while executing', () => {
    const passedProposal = { ...mockProposal, status: ProposalStatus.Passed };
    mockOnExecute.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));
    render(<ProposalDetailCard proposal={passedProposal} onExecute={mockOnExecute} />);

    const executeButton = screen.getByLabelText(/Execute proposal/);
    fireEvent.click(executeButton);

    expect(executeButton).toBeDisabled();
  });

  it('shows loading state when isLoading is true', () => {
    render(<ProposalDetailCard proposal={mockProposal} isLoading={true} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not show voting buttons when onVote is not provided', () => {
    render(<ProposalDetailCard proposal={mockProposal} />);

    expect(screen.queryByLabelText('Vote for Mahogany')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Vote against Mahogany')).not.toBeInTheDocument();
  });

  it('does not show execute button when onExecute is not provided', () => {
    const passedProposal = { ...mockProposal, status: ProposalStatus.Passed };
    render(<ProposalDetailCard proposal={passedProposal} />);

    expect(screen.queryByLabelText(/Execute proposal/)).not.toBeInTheDocument();
  });

  it('renders in compact variant', () => {
    const { container } = render(<ProposalDetailCard proposal={mockProposal} variant="compact" />);

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('p-4');
  });

  it('renders in detailed variant', () => {
    const { container } = render(<ProposalDetailCard proposal={mockProposal} variant="detailed" />);

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('p-8');
    expect(screen.getByText('A fast-growing hardwood tree species')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ProposalDetailCard proposal={mockProposal} className="custom-class" />
    );

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('custom-class');
  });

  it('displays rejected status badge', () => {
    const rejectedProposal = { ...mockProposal, status: ProposalStatus.Rejected };
    render(<ProposalDetailCard proposal={rejectedProposal} />);

    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('displays executed status badge', () => {
    const executedProposal = { ...mockProposal, status: ProposalStatus.Executed };
    render(<ProposalDetailCard proposal={executedProposal} />);

    expect(screen.getByText('Executed')).toBeInTheDocument();
  });

  it('has proper ARIA attributes for accessibility', () => {
    render(<ProposalDetailCard proposal={mockProposal} onVote={mockOnVote} />);

    const voteForButton = screen.getByLabelText('Vote for Mahogany');
    const voteAgainstButton = screen.getByLabelText('Vote against Mahogany');

    expect(voteForButton).toHaveAttribute('aria-label', 'Vote for Mahogany');
    expect(voteAgainstButton).toHaveAttribute('aria-label', 'Vote against Mahogany');
  });

  it('updates time remaining on interval', async () => {
    vi.mocked(speciesVoting.formatVotingTimeRemaining)
      .mockReturnValueOnce('5 days remaining')
      .mockReturnValueOnce('4 days 23 hours');

    render(<ProposalDetailCard proposal={mockProposal} />);

    await waitFor(
      () => {
        expect(screen.getByText('4 days 23 hours')).toBeInTheDocument();
      },
      { timeout: 1500 }
    );
  });
});
