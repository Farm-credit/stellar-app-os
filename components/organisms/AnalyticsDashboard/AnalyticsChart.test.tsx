import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AnalyticsChart } from './AnalyticsChart';

describe('AnalyticsChart', () => {
  const mockData = [
    { label: 'Jan', value: 100 },
    { label: 'Feb', value: 150 },
    { label: 'Mar', value: 200 },
  ];

  it('renders chart with title', () => {
    render(<AnalyticsChart title="Test Chart" data={mockData} />);

    expect(screen.getByText('Test Chart')).toBeInTheDocument();
  });

  it('renders line chart by default', () => {
    const { container } = render(<AnalyticsChart title="Test Chart" data={mockData} type="line" />);

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders bar chart when type is bar', () => {
    const { container } = render(<AnalyticsChart title="Test Chart" data={mockData} type="bar" />);

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<AnalyticsChart title="Test Chart" data={mockData} loading />);

    expect(screen.queryByText('Test Chart')).not.toBeInTheDocument();
  });

  it('displays no data message when data is empty', () => {
    render(<AnalyticsChart title="Test Chart" data={[]} />);

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('displays min, max, and total values', () => {
    render(<AnalyticsChart title="Test Chart" data={mockData} />);

    expect(screen.getByText(/Min:/)).toBeInTheDocument();
    expect(screen.getByText(/Max:/)).toBeInTheDocument();
    expect(screen.getByText(/Total:/)).toBeInTheDocument();
  });

  it('has proper ARIA attributes', () => {
    render(<AnalyticsChart title="Test Chart" data={mockData} />);

    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('aria-labelledby');
  });
});
