import { render, screen } from '@testing-library/react';
import { ZKProgressBar } from '@/components/atoms/ZKProgressBar';

describe('ZKProgressBar', () => {
  it('renders a progressbar role', () => {
    render(<ZKProgressBar value={50} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('sets aria-valuenow to the clamped value', () => {
    render(<ZKProgressBar value={65} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '65');
  });

  it('clamps value above 100 to 100', () => {
    render(<ZKProgressBar value={150} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('clamps value below 0 to 0', () => {
    render(<ZKProgressBar value={-20} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows percentage label by default', () => {
    render(<ZKProgressBar value={42} />);
    expect(screen.getByLabelText('42% complete')).toBeInTheDocument();
  });

  it('hides percentage label when showLabel=false', () => {
    render(<ZKProgressBar value={42} showLabel={false} />);
    expect(screen.queryByLabelText('42% complete')).not.toBeInTheDocument();
  });

  it('renders step label when provided', () => {
    render(<ZKProgressBar value={30} stepLabel="3/6 — Running ZK Prover" />);
    expect(screen.getByText('3/6 — Running ZK Prover')).toBeInTheDocument();
  });

  it('does not render step label when not provided', () => {
    render(<ZKProgressBar value={30} />);
    // No stepLabel text rendered (only percentage)
    expect(screen.queryByText(/Running/)).not.toBeInTheDocument();
  });

  it('sets aria-valuetext to "Loading…" in indeterminate mode', () => {
    render(<ZKProgressBar value={0} indeterminate />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Loading…');
  });

  it('does not set aria-valuenow in indeterminate mode', () => {
    render(<ZKProgressBar value={0} indeterminate />);
    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
  });

  it('hides numeric label in indeterminate mode', () => {
    render(<ZKProgressBar value={0} indeterminate />);
    expect(screen.queryByText('%')).not.toBeInTheDocument();
  });

  it('applies custom className to root element', () => {
    const { container } = render(<ZKProgressBar value={50} className="my-custom-bar" />);
    expect(container.firstChild).toHaveClass('my-custom-bar');
  });

  it('sets aria-valuemin to 0 and aria-valuemax to 100', () => {
    render(<ZKProgressBar value={50} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });
});
