import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BatchWalletFundingModal } from './BatchWalletFundingModal';

const baseProps = () => ({
  isOpen: true,
  onOpenChange: vi.fn(),
  onFund: vi.fn().mockResolvedValue({ batchId: 'endowment-1', transactionHashes: ['pending:1'] }),
});

describe('BatchWalletFundingModal', () => {
  it('adds and removes funding rows', () => {
    const props = baseProps();
    render(<BatchWalletFundingModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));
    expect(screen.getByLabelText('Amount 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /remove transaction 2/i }));
    expect(screen.queryByLabelText('Amount 2')).not.toBeInTheDocument();
  });

  it('shows actionable validation before calling the wallet callback', () => {
    const props = baseProps();
    render(<BatchWalletFundingModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /fund endowments/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/escrow address/i);
    expect(props.onFund).not.toHaveBeenCalled();
  });

  it('submits valid rows and shows the reconciliation receipt', async () => {
    const props = baseProps();
    render(<BatchWalletFundingModal {...props} />);
    fireEvent.change(screen.getByLabelText('Amount 1'), { target: { value: '125.50' } });
    fireEvent.change(screen.getByLabelText('Escrow address 1'), { target: { value: 'GTESTESCROW' } });
    fireEvent.change(screen.getByLabelText('Memo 1'), { target: { value: 'Q4-IMPACT-POOL' } });
    fireEvent.click(screen.getByRole('button', { name: /fund endowments/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/endowment-1/i));
    expect(props.onFund).toHaveBeenCalledWith([
      expect.objectContaining({ amount: '125.50', escrowAddress: 'GTESTESCROW', memo: 'Q4-IMPACT-POOL' }),
    ]);
  });
});
