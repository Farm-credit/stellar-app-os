import { render, screen } from '@testing-library/react';
import { ProposalList } from '../ProposalList';
import { vi } from 'vitest';

vi.mock('@/contexts/WalletContext', () => ({
  useWalletContext: () => ({
    wallet: null,
    signTransaction: vi.fn(),
  }),
}));

describe('ProposalList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders proposal list with all proposals', () => {
    render(<ProposalList />);

    // Each proposal shows name + slug, so we get 2 matches per species
    expect(screen.getAllByText(/mahogany/i)).toHaveLength(2);
    expect(screen.getAllByText(/iroko/i)).toHaveLength(2);
    expect(screen.getAllByText(/oak/i)).toHaveLength(2);
  });

  it('displays species name and slug', () => {
    render(<ProposalList />);

    // Check for both name and slug in the card title
    expect(screen.getAllByText(/mahogany/i)).toHaveLength(2);
    expect(screen.getAllByText(/iroko/i)).toHaveLength(2);
    expect(screen.getAllByText(/oak/i)).toHaveLength(2);
  });

  it('displays proposer address in truncated format', () => {
    render(<ProposalList />);

    const proposedByElements = screen.getAllByText(/proposed by/i);
    expect(proposedByElements.length).toBeGreaterThanOrEqual(3);
    // Check for at least one truncated address
    expect(screen.getByText(/GABCD12.*YZ56/i)).toBeInTheDocument();
  });

  it('displays CO₂ sequestration values correctly', () => {
    render(<ProposalList />);

    // The component shows "25.00 kg" not "25.00 kg/year"
    expect(screen.getByText(/25.00 kg/i)).toBeInTheDocument();
    expect(screen.getByText(/34.00 kg/i)).toBeInTheDocument();
    expect(screen.getByText(/30.00 kg/i)).toBeInTheDocument();
  });

  it('displays maturity years correctly', () => {
    render(<ProposalList />);

    // The component shows "25 yrs" not "25 years"
    expect(screen.getByText(/25 yrs/i)).toBeInTheDocument();
    expect(screen.getByText(/40 yrs/i)).toBeInTheDocument();
    expect(screen.getByText(/30 yrs/i)).toBeInTheDocument();
  });

  it('displays vote counts correctly', () => {
    render(<ProposalList />);

    expect(screen.getByText(/750,000/i)).toBeInTheDocument();
    expect(screen.getAllByText(/50,000/i)).toHaveLength(2);
  });

  it('displays vote percentage progress bar', () => {
    render(<ProposalList />);

    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars).toHaveLength(3);
  });

  it('shows voting time remaining for active proposals', () => {
    render(<ProposalList />);

    // Two active proposals show time remaining
    expect(screen.getAllByText(/day/i)).toHaveLength(2);
  });

  it('displays status badges correctly', () => {
    render(<ProposalList />);

    // Two active proposals
    expect(screen.getAllByText(/active/i)).toHaveLength(2);
    // One passed proposal
    expect(screen.getByText(/passed/i)).toBeInTheDocument();
  });

  it('shows vote buttons for active proposals', () => {
    render(<ProposalList />);

    const voteForButtons = screen.getAllByRole('button', { name: /vote for/i });
    expect(voteForButtons.length).toBeGreaterThanOrEqual(1);
    const voteAgainstButtons = screen.getAllByRole('button', { name: /vote against/i });
    expect(voteAgainstButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows execute button for passed proposals', () => {
    render(<ProposalList />);

    expect(screen.getByRole('button', { name: /execute proposal/i })).toBeInTheDocument();
  });

  it('shows wallet connection notice when wallet not connected', () => {
    render(<ProposalList />);

    expect(screen.getByText(/connect your wallet to cast votes/i)).toBeInTheDocument();
  });

  it('has proper accessibility attributes on progress bars', () => {
    render(<ProposalList />);

    const progressBars = screen.getAllByRole('progressbar');
    progressBars.forEach((bar) => {
      expect(bar).toHaveAttribute('aria-valuemin', '0');
      expect(bar).toHaveAttribute('aria-valuemax', '100');
      expect(bar).toHaveAttribute('aria-label');
    });
  });

  it('has proper semantic HTML structure', () => {
    render(<ProposalList />);

    // Check for card elements (each proposal is in a Card)
    const cards = document.querySelectorAll('[data-slot="card"]');
    expect(cards.length).toBeGreaterThanOrEqual(3);
  });

  it('displays vote icons for vote buttons', () => {
    render(<ProposalList />);

    const voteForButtons = screen.getAllByRole('button', { name: /vote for/i });
    voteForButtons.forEach((btn) => {
      expect(btn).toContainHTML('svg');
    });
    const voteAgainstButtons = screen.getAllByRole('button', { name: /vote against/i });
    voteAgainstButtons.forEach((btn) => {
      expect(btn).toContainHTML('svg');
    });
  });

  it('shows clock icon for voting time remaining', () => {
    render(<ProposalList />);

    const dayElements = screen.getAllByText(/day/i);
    dayElements.forEach((elem) => {
      expect(elem.parentElement).toContainHTML('svg');
    });
  });
});
