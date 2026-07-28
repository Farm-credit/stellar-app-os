import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TransactionHistoryModal } from '@/components/organisms/TransactionHistoryModal/TransactionHistoryModal';

// Disconnected wallet → the inner TransactionHistory renders its empty-state card and
// never touches the network.
vi.mock('@/contexts/WalletContext', () => ({
  useWalletContext: () => ({ wallet: null }),
}));

describe('TransactionHistoryModal', () => {
  it('does not render dialog content when closed', () => {
    render(<TransactionHistoryModal open={false} onOpenChange={() => {}} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders an accessible dialog with a title when open', () => {
    render(<TransactionHistoryModal open onOpenChange={() => {}} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Accessible name comes from the DialogTitle.
    expect(dialog).toHaveAccessibleName(/transaction history/i);
  });

  it('calls onOpenChange when closing via the close button', () => {
    const onOpenChange = vi.fn();
    render(<TransactionHistoryModal open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange when pressing Escape', () => {
    const onOpenChange = vi.fn();
    render(<TransactionHistoryModal open onOpenChange={onOpenChange} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
