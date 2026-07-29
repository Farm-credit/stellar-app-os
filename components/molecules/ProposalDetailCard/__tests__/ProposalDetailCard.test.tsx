import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProposalDetailCard } from '../ProposalDetailCard';
import type { ProposalDetailCardProps } from '../types';

const baseProps: ProposalDetailCardProps = {
  proposalId: 'PROP-001',
  title: 'Increase tree planting budget',
  description: 'Allocate 5000 XLM to fund mangrove planting in coastal regions.',
  proposer: 'alice.stellar',
  status: 'active',
  votes: { for: 120, against: 30, abstain: 10 },
  totalVoters: 160,
  deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  onVote: vi.fn(),
};

describe('ProposalDetailCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders title, description, and proposer', () => {
    render(<ProposalDetailCard {...baseProps} />);
    expect(screen.getByText(baseProps.title)).toBeInTheDocument();
    expect(screen.getByText(baseProps.description)).toBeInTheDocument();
    expect(screen.getByText(baseProps.proposer)).toBeInTheDocument();
  });

  it('renders proposal ID', () => {
    render(<ProposalDetailCard {...baseProps} />);
    expect(screen.getByText(`ID: ${baseProps.proposalId}`)).toBeInTheDocument();
  });

  it('renders Active badge for active status', () => {
    render(<ProposalDetailCard {...baseProps} status="active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders Passed badge for passed status', () => {
    render(<ProposalDetailCard {...baseProps} status="passed" />);
    expect(screen.getByText('Passed')).toBeInTheDocument();
  });

  it('renders Rejected badge for rejected status', () => {
    render(<ProposalDetailCard {...baseProps} status="rejected" />);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('renders Pending badge for pending status', () => {
    render(<ProposalDetailCard {...baseProps} status="pending" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('displays voter count', () => {
    render(<ProposalDetailCard {...baseProps} />);
    expect(screen.getByText('160 voters')).toBeInTheDocument();
  });

  it('displays singular voter count for 1 voter', () => {
    render(<ProposalDetailCard {...baseProps} totalVoters={1} />);
    expect(screen.getByText('1 voter')).toBeInTheDocument();
  });

  it('renders vote progress bar with correct aria-label', () => {
    render(<ProposalDetailCard {...baseProps} />);
    const progressBar = screen.getByRole('group', { name: /vote breakdown/i });
    expect(progressBar).toBeInTheDocument();
  });

  it('renders three voting action buttons for active proposals', () => {
    render(<ProposalDetailCard {...baseProps} />);
    expect(screen.getByRole('button', { name: /vote for/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /vote against/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /abstain/i })).toBeInTheDocument();
  });

  it('calls onVote with correct arguments when Vote For is clicked', () => {
    const onVote = vi.fn();
    render(<ProposalDetailCard {...baseProps} onVote={onVote} />);
    fireEvent.click(screen.getByRole('button', { name: /vote for/i }));
    expect(onVote).toHaveBeenCalledWith('PROP-001', 'for');
  });

  it('calls onVote with correct arguments when Vote Against is clicked', () => {
    const onVote = vi.fn();
    render(<ProposalDetailCard {...baseProps} onVote={onVote} />);
    fireEvent.click(screen.getByRole('button', { name: /vote against/i }));
    expect(onVote).toHaveBeenCalledWith('PROP-001', 'against');
  });

  it('calls onVote with correct arguments when Abstain is clicked', () => {
    const onVote = vi.fn();
    render(<ProposalDetailCard {...baseProps} onVote={onVote} />);
    fireEvent.click(screen.getByRole('button', { name: /abstain/i }));
    expect(onVote).toHaveBeenCalledWith('PROP-001', 'abstain');
  });

  it('disables voting buttons for non-active proposals', () => {
    render(<ProposalDetailCard {...baseProps} status="passed" />);
    expect(screen.getByRole('button', { name: /vote for/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /vote against/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /abstain/i })).toBeDisabled();
  });

  it('disables non-selected buttons when user has voted', () => {
    render(<ProposalDetailCard {...baseProps} userVote="for" />);
    const forBtn = screen.getByRole('button', { name: /vote for/i });
    const againstBtn = screen.getByRole('button', { name: /vote against/i });
    const abstainBtn = screen.getByRole('button', { name: /abstain/i });
    expect(forBtn).not.toBeDisabled();
    expect(againstBtn).toBeDisabled();
    expect(abstainBtn).toBeDisabled();
  });

  it('marks selected button as aria-pressed', () => {
    render(<ProposalDetailCard {...baseProps} userVote="for" />);
    const forBtn = screen.getByRole('button', { name: /vote for/i });
    expect(forBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('applies custom className', () => {
    const { container } = render(
      <ProposalDetailCard {...baseProps} className="my-custom-class" />
    );
    expect(container.firstChild).toHaveClass('my-custom-class');
  });

  it('renders with custom ref', () => {
    const ref = { current: null };
    render(<ProposalDetailCard {...baseProps} ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
