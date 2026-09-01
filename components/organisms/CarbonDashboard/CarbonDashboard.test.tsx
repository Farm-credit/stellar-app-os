import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CarbonDashboard } from './CarbonDashboard';

describe('CarbonDashboard', () => {
  it('renders dashboard headings and statistics', async () => {
    render(<CarbonDashboard />);

    expect(screen.getByRole('heading', { name: /carbon footprint/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /1 week/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /refresh stats/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/total trees sponsored/i)).toBeInTheDocument();
      expect(screen.getByText(/total co₂ offset/i)).toBeInTheDocument();
    });
  });

  it('shows live counter cards and updates when range is switched', async () => {
    render(<CarbonDashboard />);

    const monthTab = await screen.findByRole('tab', { name: /1 month/i });
    await waitFor(() => {
      expect(monthTab).toBeEnabled();
    });
    fireEvent.click(monthTab);

    await waitFor(() => {
      expect(monthTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText(/total trees sponsored/i)).toBeInTheDocument();
    });
  });

  it('renders accessible range buttons and status', async () => {
    render(<CarbonDashboard />);

    const buttons = screen.getAllByRole('tab');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAccessibleName('1 Week');
    expect(buttons[0]).toHaveAttribute('aria-selected');

    await waitFor(() => {
      expect(screen.getByLabelText(/loading carbon projection chart/i)).toBeInTheDocument();
    });
  });
});
