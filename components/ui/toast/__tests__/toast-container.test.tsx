import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToastContainer } from '../toast-container';
import type { ToastData } from '../types';

const toasts: ToastData[] = [
  { id: '1', message: 'Saved successfully', variant: 'success' },
  { id: '2', message: 'Failed to save', variant: 'error' },
];

describe('ToastContainer', () => {
  it('exposes a labelled notifications region landmark', () => {
    render(<ToastContainer toasts={toasts} remove={() => {}} position="top-right" />);

    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('announces success politely and errors assertively', () => {
    render(<ToastContainer toasts={toasts} remove={() => {}} position="top-right" />);

    const status = screen.getByRole('status');
    const alert = screen.getByRole('alert');

    expect(status).toHaveTextContent('Saved successfully');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(alert).toHaveTextContent('Failed to save');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });
});
