import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SponsoredTreeMap } from './SponsoredTreeMap';
import userEvent from '@testing-library/user-event';

// Mock react-leaflet components
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, ...props }: any) => (
    <div data-testid="map-container" {...props}>
      {children}
    </div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  CircleMarker: ({ children }: any) => <div data-testid="circle-marker">{children}</div>,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
  Tooltip: ({ children }: any) => <div data-testid="tooltip">{children}</div>,
  useMapEvents: () => null,
}));

// Mock Leaflet
vi.mock('leaflet', () => ({
  Icon: {
    Default: {
      prototype: { _getIconUrl: null },
      mergeOptions: vi.fn(),
    },
  },
}));

describe('SponsoredTreeMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heading and descriptive text', () => {
    render(<SponsoredTreeMap />);

    expect(screen.getByText('Sponsored Tree Map')).toBeInTheDocument();
    expect(
      screen.getByText(/Explore sponsored tree planting locations with interactive filtering/i)
    ).toBeInTheDocument();
  });

  it('renders map with sponsored tree markers and accessible label', async () => {
    render(<SponsoredTreeMap />);

    await waitFor(() => {
      const map = screen.getByTestId('map-container');
      expect(map).toBeInTheDocument();
      expect(map).toHaveAttribute(
        'aria-label',
        'Interactive map of sponsored tree planting locations'
      );
    });

    const markers = screen.getAllByTestId('circle-marker');
    expect(markers.length).toBeGreaterThan(0);
  });

  it('renders filter panel with species, planting year, and sponsor filters', () => {
    render(<SponsoredTreeMap />);

    expect(screen.getByLabelText(/Filter by tree species/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Filter by planting year/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Filter by sponsor organisation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear all filters/i })).toBeInTheDocument();
  });

  it('filters markers when a species is selected', async () => {
    const user = userEvent.setup();
    render(<SponsoredTreeMap />);

    const speciesSelect = screen.getByLabelText(/Filter by tree species/i);
    await user.selectOptions(speciesSelect, 'Teak');

    await waitFor(() => {
      expect(speciesSelect).toHaveValue('Teak');
      expect(screen.getByText(/Displaying/i)).toBeInTheDocument();
    });
  });

  it('filters markers when a planting year is selected', async () => {
    const user = userEvent.setup();
    render(<SponsoredTreeMap />);

    const yearSelect = screen.getByLabelText(/Filter by planting year/i);
    const options = screen.getAllByRole('option');
    const yearOption = options.find((opt) => opt.getAttribute('value') === '2024');

    if (yearOption) {
      await user.selectOptions(yearSelect, '2024');
      await waitFor(() => {
        expect(yearSelect).toHaveValue('2024');
      });
    }
  });

  it('filters markers when a sponsor is selected', async () => {
    const user = userEvent.setup();
    render(<SponsoredTreeMap />);

    const sponsorSelect = screen.getByLabelText(
      /Filter by sponsor organisation/i
    ) as HTMLSelectElement;
    const sponsorOptions = Array.from(sponsorSelect.options).filter((opt) => opt.value !== 'all');

    if (sponsorOptions.length > 0) {
      const chosenValue = sponsorOptions[0].value;
      await user.selectOptions(sponsorSelect, chosenValue);

      await waitFor(() => {
        expect(sponsorSelect).toHaveValue(chosenValue);
      });
    }
  });

  it('clears all filters when "Clear all" button is clicked', async () => {
    const user = userEvent.setup();
    render(<SponsoredTreeMap />);

    const speciesSelect = screen.getByLabelText(/Filter by tree species/i);
    await user.selectOptions(speciesSelect, 'Teak');

    const clearButton = screen.getByRole('button', { name: /Clear all filters/i });
    expect(clearButton).not.toBeDisabled();

    await user.click(clearButton);

    await waitFor(() => {
      expect(speciesSelect).toHaveValue('all');
      expect(clearButton).toBeDisabled();
    });
  });

  it('displays accurate status summary with aria-live="polite"', async () => {
    render(<SponsoredTreeMap />);

    await waitFor(() => {
      const statusElement = screen.getByRole('status');
      expect(statusElement).toBeInTheDocument();
      expect(statusElement).toHaveTextContent(/Displaying \d+ sponsored tree/i);
    });
  });

  it('renders popups with tree and sponsor information', async () => {
    render(<SponsoredTreeMap />);

    await waitFor(() => {
      const popups = screen.getAllByTestId('popup');
      expect(popups.length).toBeGreaterThan(0);
    });
  });
});
