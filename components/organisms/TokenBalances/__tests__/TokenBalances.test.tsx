import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenBalances } from '@/components/organisms/TokenBalances/TokenBalances';
import { useTokenBalances } from '@/hooks/useTokenBalances';

// The modal renders the real TransactionHistory organism, which reads wallet context.
// Stub both the balances hook and the modal's data source so no network happens.
vi.mock('@/hooks/useTokenBalances', () => ({
  useTokenBalances: vi.fn(),
  DEFAULT_BALANCE_POLL_INTERVAL: 15000,
}));

vi.mock('@/contexts/WalletContext', () => ({
  useWalletContext: () => ({ wallet: null }),
}));

const mockUseTokenBalances = vi.mocked(useTokenBalances);

function makeResult(overrides: Partial<ReturnType<typeof useTokenBalances>> = {}) {
  return {
    balance: { xlm: '123.4567000', usdc: '50.0000000' },
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isConnected: true,
    ...overrides,
  };
}

describe('TokenBalances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prompts to connect when no wallet is connected', () => {
    mockUseTokenBalances.mockReturnValue(makeResult({ isConnected: false }));

    render(<TokenBalances />);

    expect(screen.getByText(/no wallet connected/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /token balances/i })).toBeInTheDocument();
  });

  it('renders XLM and USDC balances when connected', () => {
    mockUseTokenBalances.mockReturnValue(makeResult());

    render(<TokenBalances />);

    const xlmTile = screen.getByRole('group', { name: /xlm balance/i });
    const usdcTile = screen.getByRole('group', { name: /usdc balance/i });

    expect(within(xlmTile).getByText('123.4567')).toBeInTheDocument();
    expect(within(usdcTile).getByText('50.00')).toBeInTheDocument();
  });

  it('shows a live indicator that reflects fetching state', () => {
    mockUseTokenBalances.mockReturnValue(makeResult({ isFetching: true }));

    render(<TokenBalances />);

    expect(screen.getByText(/updating/i)).toBeInTheDocument();
  });

  it('renders an error state with a working retry button', () => {
    const refetch = vi.fn();
    mockUseTokenBalances.mockReturnValue(
      makeResult({ isError: true, error: new Error('Horizon down'), refetch })
    );

    render(<TokenBalances />);

    expect(screen.getByText(/failed to load balances/i)).toBeInTheDocument();
    expect(screen.getByText(/horizon down/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('calls refetch when the refresh button is clicked', () => {
    const refetch = vi.fn();
    mockUseTokenBalances.mockReturnValue(makeResult({ refetch }));

    render(<TokenBalances />);

    fireEvent.click(screen.getByRole('button', { name: /refresh balances/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('opens the transaction history modal when the button is clicked', () => {
    mockUseTokenBalances.mockReturnValue(makeResult());

    render(<TokenBalances />);

    // Dialog is closed initially.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /transaction history/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName(/transaction history/i);
  });
});
