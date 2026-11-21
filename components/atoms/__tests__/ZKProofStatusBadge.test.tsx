import { render, screen } from '@testing-library/react';
import { ZKProofStatusBadge } from '@/components/atoms/ZKProofStatusBadge';

describe('ZKProofStatusBadge', () => {
  it('renders status role="status" for accessibility', () => {
    render(<ZKProofStatusBadge status="idle" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows "ZK Proof Ready" label for idle status', () => {
    render(<ZKProofStatusBadge status="idle" />);
    expect(screen.getByRole('status')).toHaveTextContent('ZK Proof Ready');
  });

  it('shows "Generating…" label for running status', () => {
    render(<ZKProofStatusBadge status="running" />);
    expect(screen.getByRole('status')).toHaveTextContent('Generating…');
  });

  it('shows "Proof Valid" label for success status', () => {
    render(<ZKProofStatusBadge status="success" />);
    expect(screen.getByRole('status')).toHaveTextContent('Proof Valid');
  });

  it('shows "Proof Failed" label for error status', () => {
    render(<ZKProofStatusBadge status="error" />);
    expect(screen.getByRole('status')).toHaveTextContent('Proof Failed');
  });

  it('has aria-live="polite" for screen reader announcements', () => {
    render(<ZKProofStatusBadge status="running" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('has aria-label matching the status text', () => {
    render(<ZKProofStatusBadge status="success" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Proof Valid');
  });

  it('applies custom className', () => {
    render(<ZKProofStatusBadge status="idle" className="custom-badge" />);
    expect(screen.getByRole('status')).toHaveClass('custom-badge');
  });

  it('renders all four statuses without throwing', () => {
    const statuses = ['idle', 'running', 'success', 'error'] as const;
    for (const status of statuses) {
      expect(() => render(<ZKProofStatusBadge status={status} />)).not.toThrow();
    }
  });

  it('shows spinner icon for running status', () => {
    render(<ZKProofStatusBadge status="running" />);
    // Loader2 has animate-spin class
    const badge = screen.getByRole('status');
    expect(badge.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
