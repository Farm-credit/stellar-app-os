import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WalletModal } from '../WalletModal';
import { useWalletContext } from '@/contexts/WalletContext';
import { isFreighterInstalled, isRangoInstalled, isXBullInstalled } from '@/lib/stellar/wallet';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/contexts/WalletContext', () => ({
  useWalletContext: vi.fn(),
}));

vi.mock('@/lib/stellar/wallet', () => ({
  isFreighterInstalled: vi.fn(),
  isRangoInstalled: vi.fn(),
  isXBullInstalled: vi.fn(),
}));

describe('WalletModal', () => {
  const mockConnect = vi.fn();
  const mockOnOpenChange = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useWalletContext as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      connect: mockConnect,
      isLoading: false,
      error: null,
      wallet: null,
    });

    (isFreighterInstalled as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (isRangoInstalled as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (isXBullInstalled as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  it('does not render content when isOpen is false', () => {
    render(<WalletModal isOpen={false} onOpenChange={mockOnOpenChange} />);

    expect(screen.queryByText('Connect Wallet')).not.toBeInTheDocument();
  });

  it('renders modal header and options when isOpen is true', async () => {
    render(<WalletModal isOpen={true} onOpenChange={mockOnOpenChange} />);

    await waitFor(() => {
      expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
    });

    expect(screen.getByText('Choose how you want to connect to Stellar')).toBeInTheDocument();
    expect(screen.getByText('Freighter')).toBeInTheDocument();
    expect(screen.getByText('Albedo')).toBeInTheDocument();
    expect(screen.getByText('Rango')).toBeInTheDocument();
  });

  it('displays "Not installed" badge and link when extension wallet is missing', async () => {
    (isFreighterInstalled as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (isRangoInstalled as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    render(<WalletModal isOpen={true} onOpenChange={mockOnOpenChange} />);

    await waitFor(() => {
      const badges = screen.getAllByText('Not installed');
      expect(badges.length).toBeGreaterThan(0);
    });

    expect(screen.getByText('Install Freighter')).toBeInTheDocument();
    expect(screen.getByText('Install Rango')).toBeInTheDocument();
  });

  it('triggers connect when an active wallet option is clicked', async () => {
    mockConnect.mockResolvedValueOnce(undefined);

    render(<WalletModal isOpen={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />);

    await waitFor(() => {
      expect(screen.getByText('Freighter')).toBeInTheDocument();
    });

    const albedoBtn = screen.getByRole('button', { name: /connect with albedo/i });
    fireEvent.click(albedoBtn);

    expect(mockConnect).toHaveBeenCalledWith('albedo');
  });

  it('displays error banner when connection fails', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Connection cancelled by user'));

    render(<WalletModal isOpen={true} onOpenChange={mockOnOpenChange} />);

    await waitFor(() => {
      expect(screen.getByText('Albedo')).toBeInTheDocument();
    });

    const albedoBtn = screen.getByRole('button', { name: /connect with albedo/i });
    fireEvent.click(albedoBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/connection cancelled/i)).toBeInTheDocument();
    });
  });

  it('renders success state upon successful wallet connection', async () => {
    mockConnect.mockResolvedValueOnce(undefined);

    render(<WalletModal isOpen={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />);

    await waitFor(() => {
      expect(screen.getByText('Albedo')).toBeInTheDocument();
    });

    const albedoBtn = screen.getByRole('button', { name: /connect with albedo/i });
    fireEvent.click(albedoBtn);

    await waitFor(() => {
      expect(screen.getByText('Albedo connected')).toBeInTheDocument();
    });
  });

  it('meets accessibility requirements with proper ARIA attributes', async () => {
    render(<WalletModal isOpen={true} onOpenChange={mockOnOpenChange} />);

    await waitFor(() => {
      const dialogContent = screen.getByLabelText('Connect your Stellar wallet');
      expect(dialogContent).toBeInTheDocument();
    });
  });
});
