import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MetricCard } from './MetricCard';
import { Leaf } from 'lucide-react';

describe('MetricCard', () => {
  it('renders metric card with title and value', () => {
    render(<MetricCard title="Test Metric" value="1,234" />);

    expect(screen.getByText('Test Metric')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('displays change percentage with trend', () => {
    render(<MetricCard title="Test Metric" value="1,234" change={15.5} trend="up" />);

    expect(screen.getByText('↑ 15.5% vs last month')).toBeInTheDocument();
  });

  it('shows icon when provided', () => {
    render(
      <MetricCard title="Test Metric" value="1,234" icon={<Leaf data-testid="metric-icon" />} />
    );

    expect(screen.getByTestId('metric-icon')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<MetricCard title="Test Metric" value="1,234" loading />);

    expect(screen.queryByText('Test Metric')).not.toBeInTheDocument();
    expect(screen.queryByText('1,234')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <MetricCard title="Test Metric" value="1,234" className="custom-class" />
    );

    const card = container.querySelector('.custom-class');
    expect(card).toBeInTheDocument();
  });
});
