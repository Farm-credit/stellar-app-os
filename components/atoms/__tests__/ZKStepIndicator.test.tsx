import { render, screen } from '@testing-library/react';
import { Shield } from 'lucide-react';
import { ZKStepIndicator } from '@/components/atoms/ZKStepIndicator';

describe('ZKStepIndicator', () => {
  const defaultProps = {
    icon: <Shield data-testid="shield-icon" />,
    label: 'Acquiring GPS Coordinates',
    status: 'pending' as const,
  };

  it('renders label text', () => {
    render(<ZKStepIndicator {...defaultProps} />);
    expect(screen.getByText('Acquiring GPS Coordinates')).toBeInTheDocument();
  });

  it('renders sublabel when provided', () => {
    render(
      <ZKStepIndicator
        {...defaultProps}
        sublabel="navigator.geolocation.getCurrentPosition()"
      />
    );
    expect(screen.getByText('navigator.geolocation.getCurrentPosition()')).toBeInTheDocument();
  });

  it('does not render sublabel when not provided', () => {
    render(<ZKStepIndicator {...defaultProps} />);
    expect(
      screen.queryByText('navigator.geolocation.getCurrentPosition()')
    ).not.toBeInTheDocument();
  });

  it('has correct aria-label reflecting status', () => {
    render(<ZKStepIndicator {...defaultProps} status="active" />);
    const el = screen.getByRole('listitem');
    expect(el).toHaveAttribute('aria-label', 'Acquiring GPS Coordinates: active');
  });

  it('shows spinning loader icon when active', () => {
    render(<ZKStepIndicator {...defaultProps} status="active" />);
    // Loader2 has animate-spin applied
    const container = screen.getByRole('listitem');
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('does not show duration badge when pending', () => {
    render(<ZKStepIndicator {...defaultProps} status="pending" durationMs={350} />);
    // Duration badge only appears when complete
    expect(screen.queryByText(/ms/)).not.toBeInTheDocument();
  });

  it('shows duration badge when complete and durationMs provided', () => {
    render(<ZKStepIndicator {...defaultProps} status="complete" durationMs={350} />);
    expect(screen.getByText('350ms')).toBeInTheDocument();
  });

  it('shows duration in seconds when >= 1000ms', () => {
    render(<ZKStepIndicator {...defaultProps} status="complete" durationMs={2400} />);
    expect(screen.getByText('2.4s')).toBeInTheDocument();
  });

  it('does not show duration badge when complete but no durationMs', () => {
    render(<ZKStepIndicator {...defaultProps} status="complete" />);
    expect(screen.queryByText(/ms|s$/)).not.toBeInTheDocument();
  });

  it('applies pending opacity styling', () => {
    render(<ZKStepIndicator {...defaultProps} status="pending" />);
    const el = screen.getByRole('listitem');
    expect(el).toHaveClass('opacity-50');
  });

  it('applies active styling with border', () => {
    render(<ZKStepIndicator {...defaultProps} status="active" />);
    const el = screen.getByRole('listitem');
    expect(el).toHaveClass('opacity-100');
  });

  it('applies custom className', () => {
    render(<ZKStepIndicator {...defaultProps} className="custom-test-class" />);
    const el = screen.getByRole('listitem');
    expect(el).toHaveClass('custom-test-class');
  });

  it('renders all four statuses without throwing', () => {
    const statuses = ['pending', 'active', 'complete', 'error'] as const;
    for (const status of statuses) {
      expect(() =>
        render(<ZKStepIndicator {...defaultProps} status={status} />)
      ).not.toThrow();
    }
  });
});
