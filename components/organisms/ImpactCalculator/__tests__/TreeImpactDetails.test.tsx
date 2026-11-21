import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TreeImpactDetails } from '@/components/organisms/ImpactCalculator/TreeImpactDetails';

describe('TreeImpactDetails', () => {
  it('renders heading, controls, species banner, and metric cards', () => {
    render(<TreeImpactDetails />);

    expect(
      screen.getByRole('heading', { level: 2, name: /Per-Tree Environmental Impact/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Tree species/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Number of trees/i)).toBeInTheDocument();
    expect(screen.getByText(/Time horizon:/i)).toBeInTheDocument();

    // Check 4 metric cards
    expect(screen.getByText(/CO₂ sequestered/i)).toBeInTheDocument();
    expect(screen.getByText(/Water conserved/i)).toBeInTheDocument();
    expect(screen.getByText(/^Habitat restored$/i)).toBeInTheDocument();
    expect(screen.getByText(/Oxygen produced/i)).toBeInTheDocument();
  });

  it('defaults to oak, 10 trees, and 10 years', () => {
    render(<TreeImpactDetails />);

    const select = screen.getByLabelText(/Tree species/i) as HTMLSelectElement;
    expect(select.value).toBe('oak');

    const input = screen.getByLabelText(/Number of trees/i) as HTMLInputElement;
    expect(input.value).toBe('10');

    // 10yr button is pressed
    const tenYrButton = screen.getByRole('button', { name: '10yr' });
    expect(tenYrButton).toHaveAttribute('aria-pressed', 'true');

    // Oak maturity badge
    expect(screen.getByText(/Matures in 40yr/i)).toBeInTheDocument();
    expect(screen.getByText(/Biodiversity 88\/100/i)).toBeInTheDocument();
  });

  it('updates species information and recalculates when a new species is selected', () => {
    render(<TreeImpactDetails />);

    const select = screen.getByLabelText(/Tree species/i);
    fireEvent.change(select, { target: { value: 'mangrove' } });

    expect(screen.getByText(/Matures in 15yr/i)).toBeInTheDocument();
    expect(screen.getByText(/Biodiversity 95\/100/i)).toBeInTheDocument();
    expect(screen.getByText(/Mangroves are coastal ecosystems/i)).toBeInTheDocument();
  });

  it('recalculates metrics when tree count is modified', () => {
    render(<TreeImpactDetails />);

    const input = screen.getByLabelText(/Number of trees/i);
    fireEvent.change(input, { target: { value: '50' } });

    expect((input as HTMLInputElement).value).toBe('50');
    // 50 trees * 30 m2 = 1,500 m2
    expect(screen.getByText('1,500')).toBeInTheDocument();
  });

  it('recalculates time-dependent metrics when changing the time horizon', () => {
    render(<TreeImpactDetails />);

    const fiveYrBtn = screen.getByRole('button', { name: '5yr' });
    fireEvent.click(fiveYrBtn);

    expect(fiveYrBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '10yr' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/CO₂ sequestered over 5yr/i)).toBeInTheDocument();
    expect(screen.getByText(/Water conserved over 5yr/i)).toBeInTheDocument();
  });
});
