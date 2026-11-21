'use client';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CarbonCreditSwapWidget } from './CarbonCreditSwapWidget';
import { useWalletContext } from '@/contexts/WalletContext';
import { useSwapQuote } from '@/hooks/useSwapQuote';

vi.mock('@/contexts/WalletContext', async () => {
  const actual = await vi.importActual('@/contexts/WalletContext');
  return {
    ...actual,
    useWalletContext: vi.fn(),
  };
});

vi.mock('@/hooks/useSwapQuote', async () => {
  const actual = await vi.importActual('@/hooks/useSwapQuote');
  return {
    ...actual,
    useSwapQuote: vi.fn(),
  };
});

const mockUseWalletContext = useWalletContext as ReturnType<typeof vi.fn>;
const mockUseSwapQuote = useSwapQuote as ReturnType<typeof vi.fn>;

const mockWalletConnected = {
  wallet: {
    type: 'freighter',
    publicKey: 'GBUQWP3BOUZX34JSWAKBZNXKJQ2KXQJQ2KXQJQ2KXQJQ2',
    network: 'testnet',
    isConnected: true,
    balance: { xlm: '1500.00', usdc: '500.00' },
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  switchNetwork: vi.fn(),
  refreshBalance: vi.fn(),
  signTransaction: vi.fn(),
  isLoading: false,
  error: null,
  loadPersistedConnection: vi.fn(),
};

const mockWalletDisconnected = {
  wallet: null,
  connect: vi.fn(),
  disconnect: vi.fn(),
  switchNetwork: vi.fn(),
  refreshBalance: vi.fn(),
  signTransaction: vi.fn(),
  isLoading: false,
  error: null,
  loadPersistedConnection: vi.fn(),
};

function mockQuote(overrides = {}) {
  return {
    outputAmount: 0,
    exchangeRate: 0,
    minimumReceived: 0,
    slippageTolerance: 0.01,
    priceImpact: 0,
    loading: false,
    error: null,
    ...overrides,
  };
}

describe('CarbonCreditSwapWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the widget with default USDC selected', () => {
    mockUseWalletContext.mockReturnValue(mockWalletConnected);
    mockUseSwapQuote.mockReturnValue(mockQuote());

    render(<CarbonCreditSwapWidget />);

    expect(screen.getByLabelText(/enter amount to spend/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy carbon credits/i })).toBeDisabled();
  });

  it('shows wallet disconnected state', () => {
    mockUseWalletContext.mockReturnValue(mockWalletDisconnected);
    mockUseSwapQuote.mockReturnValue(mockQuote());

    render(<CarbonCreditSwapWidget />);

    expect(screen.getByText(/connect your wallet to purchase carbon credits/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
  });

  it('allows user to enter an amount', async () => {
    const user = userEvent.setup();
    mockUseWalletContext.mockReturnValue(mockWalletConnected);
    mockUseSwapQuote.mockReturnValue(mockQuote());

    render(<CarbonCreditSwapWidget />);

    const amountInput = screen.getByLabelText(/enter amount to spend/i);
    await user.type(amountInput, '50');

    expect(amountInput).toHaveValue('50');
  });

  it('disables purchase button when wallet is disconnected', () => {
    mockUseWalletContext.mockReturnValue(mockWalletDisconnected);
    mockUseSwapQuote.mockReturnValue(mockQuote());

    render(<CarbonCreditSwapWidget />);

    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeDisabled();
  });

  it('disables purchase button when amount is invalid', () => {
    mockUseWalletContext.mockReturnValue(mockWalletConnected);
    mockUseSwapQuote.mockReturnValue(mockQuote());

    render(<CarbonCreditSwapWidget />);

    expect(screen.getByRole('button', { name: /buy carbon credits/i })).toBeDisabled();
  });

  it('shows loading state when quote is loading', () => {
    mockUseWalletContext.mockReturnValue(mockWalletConnected);
    mockUseSwapQuote.mockReturnValue(mockQuote({ loading: true }));

    render(<CarbonCreditSwapWidget />);

    expect(screen.getByText(/you will receive/i)).toBeInTheDocument();
  });

  it('shows error state when quote fails', () => {
    mockUseWalletContext.mockReturnValue(mockWalletConnected);
    mockUseSwapQuote.mockReturnValue(mockQuote({ error: 'Failed to fetch quote' }));

    render(<CarbonCreditSwapWidget />);

    expect(screen.getByText(/failed to fetch quote/i)).toBeInTheDocument();
  });

  it('has accessible labels for key interactive elements', () => {
    mockUseWalletContext.mockReturnValue(mockWalletConnected);
    mockUseSwapQuote.mockReturnValue(mockQuote());

    render(<CarbonCreditSwapWidget />);

    expect(screen.getByLabelText(/enter amount to spend/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/slippage tolerance settings/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/switch payment asset between usdc and xlm/i)).toBeInTheDocument();
  });

  it('shows insufficient balance state with high amount', () => {
    mockUseWalletContext.mockReturnValue({
      ...mockWalletConnected,
      wallet: {
        ...mockWalletConnected.wallet,
        balance: { xlm: '10.00', usdc: '5.00' },
      },
    });
    mockUseSwapQuote.mockReturnValue(mockQuote({ outputAmount: 100 }));

    render(<CarbonCreditSwapWidget />);

    const amountInput = screen.getByLabelText(/enter amount to spend/i);
    expect(amountInput).toBeInTheDocument();
  });

  it('shows price impact when available', () => {
    mockUseWalletContext.mockReturnValue(mockWalletConnected);
    mockUseSwapQuote.mockReturnValue(mockQuote({ outputAmount: 10, priceImpact: 0.05 }));

    render(<CarbonCreditSwapWidget />);

    expect(screen.getByText(/price impact:/i)).toBeInTheDocument();
  });

  it('disables the swap button when wallet is disconnected', () => {
    mockUseWalletContext.mockReturnValue(mockWalletDisconnected);
    mockUseSwapQuote.mockReturnValue(mockQuote());

    render(<CarbonCreditSwapWidget />);

    expect(screen.getByLabelText(/switch payment asset between usdc and xlm/i)).toBeDisabled();
  });
});
