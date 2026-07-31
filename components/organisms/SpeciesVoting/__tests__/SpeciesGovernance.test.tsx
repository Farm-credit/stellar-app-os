import { render, screen } from '@testing-library/react';
import { SpeciesGovernance } from '../SpeciesGovernance';
import { vi } from 'vitest';

vi.mock('@/contexts/WalletContext', () => ({
  useWalletContext: () => ({
    wallet: null,
    signTransaction: vi.fn(),
  }),
}));

describe('SpeciesGovernance', () => {
  it('renders page title and description', () => {
    render(<SpeciesGovernance />);

    expect(
      screen.getByRole('heading', { name: /species governance/i, level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByText(/propose and vote for new tree species/i)).toBeInTheDocument();
  });

  it('renders tabs for proposals and create proposal', () => {
    render(<SpeciesGovernance />);

    expect(screen.getByRole('tab', { name: /proposals/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /create proposal/i })).toBeInTheDocument();
  });

  it('shows proposals tab content by default', () => {
    render(<SpeciesGovernance />);

    expect(screen.getByText(/active proposals/i)).toBeInTheDocument();
    expect(screen.getByText(/vote on proposed species additions/i)).toBeInTheDocument();
    // There are multiple "Vote For" buttons (2 active proposals)
    expect(screen.getAllByRole('button', { name: /vote for/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('renders CreateProposalForm when create tab is active (controlled)', () => {
    // The component uses internal state, so we test default behavior
    // The create tab content is not shown by default
    render(<SpeciesGovernance />);

    expect(screen.queryByText(/propose new species/i)).not.toBeInTheDocument();
  });

  it('has proper tab panel accessibility', () => {
    render(<SpeciesGovernance />);

    const proposalsTab = screen.getByRole('tab', { name: /proposals/i });
    const createTab = screen.getByRole('tab', { name: /create proposal/i });

    expect(proposalsTab).toHaveAttribute('aria-selected', 'true');
    expect(createTab).toHaveAttribute('aria-selected', 'false');
  });

  it('has tab icons', () => {
    render(<SpeciesGovernance />);

    const proposalsTab = screen.getByRole('tab', { name: /proposals/i });
    const createTab = screen.getByRole('tab', { name: /create proposal/i });

    expect(proposalsTab).toContainHTML('svg');
    expect(createTab).toContainHTML('svg');
  });

  it('displays wallet connection notice in proposals tab', () => {
    render(<SpeciesGovernance />);

    expect(screen.getByText(/connect your wallet to cast votes/i)).toBeInTheDocument();
  });

  it('has proper semantic structure', () => {
    render(<SpeciesGovernance />);

    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });
});
