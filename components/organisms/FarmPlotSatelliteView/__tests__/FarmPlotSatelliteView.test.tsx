import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FarmPlotSatelliteView } from '../FarmPlotSatelliteView';

const mockLeaflet = {
  map: vi.fn(() => ({
    setView: vi.fn().mockReturnThis(),
    addLayer: vi.fn().mockReturnThis(),
    removeLayer: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    invalidateSize: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getZoom: vi.fn(() => 13),
  })),
  tileLayer: vi.fn(() => ({
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  })),
  marker: vi.fn(() => ({
    bindPopup: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
  })),
};

vi.mock('leaflet', () => ({
  ...vi.requireActual('leaflet'),
  map: mockLeaflet.map,
  tileLayer: mockLeaflet.tileLayer,
  marker: mockLeaflet.marker,
}));

describe('FarmPlotSatelliteView', () => {
  const defaultProps = {
    plotName: 'North Field Plot A',
    plotLocation: 'Kakamega County, Kenya',
    plotId: 'PLOT-001',
    coordinates: { latitude: 0.2827, longitude: 34.7519 },
    showSatelliteToggle: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.L = mockLeaflet as unknown as typeof global.L;
  });

  afterEach(() => {
    delete global.L;
  });

  it('renders plot name and location', () => {
    render(<FarmPlotSatelliteView {...defaultProps} />);

    expect(screen.getByText('North Field Plot A')).toBeInTheDocument();
    expect(screen.getByText(/Kakamega County, Kenya/i)).toBeInTheDocument();
    expect(screen.getByText('PLOT-001')).toBeInTheDocument();
  });

  it('renders satellite toggle buttons', () => {
    render(<FarmPlotSatelliteView {...defaultProps} />);

    expect(screen.getByRole('button', { name: /switch to street view/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch to satellite view/i })).toBeInTheDocument();
  });

  it('shows street view as default active', () => {
    render(<FarmPlotSatelliteView {...defaultProps} />);

    const streetButton = screen.getByRole('button', { name: /switch to street view/i });
    const satelliteButton = screen.getByRole('button', { name: /switch to satellite view/i });

    expect(streetButton).toHaveAttribute('aria-pressed', 'true');
    expect(satelliteButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles to satellite view when satellite button clicked', async () => {
    const user = userEvent.setup();
    render(<FarmPlotSatelliteView {...defaultProps} />);

    const satelliteButton = screen.getByRole('button', { name: /switch to satellite view/i });
    await user.click(satelliteButton);

    expect(satelliteButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /switch to street view/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('toggles back to street view when street button clicked', async () => {
    const user = userEvent.setup();
    render(<FarmPlotSatelliteView {...defaultProps} />);

    const satelliteButton = screen.getByRole('button', { name: /switch to satellite view/i });
    const streetButton = screen.getByRole('button', { name: /switch to street view/i });

    await user.click(satelliteButton);
    await user.click(streetButton);

    expect(streetButton).toHaveAttribute('aria-pressed', 'true');
    expect(satelliteButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides satellite toggle when showSatelliteToggle is false', () => {
    render(<FarmPlotSatelliteView {...defaultProps} showSatelliteToggle={false} />);

    expect(
      screen.queryByRole('button', { name: /switch to street view/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /switch to satellite view/i })
    ).not.toBeInTheDocument();
  });

  it('displays loading state initially', () => {
    render(<FarmPlotSatelliteView {...defaultProps} />);

    expect(screen.getByText(/loading map/i)).toBeInTheDocument();
  });

  it('displays coordinates in DMS format', () => {
    render(<FarmPlotSatelliteView {...defaultProps} />);

    const footerCoords = screen.getByText(/0\.282700° N/i, { selector: 'span' });
    expect(footerCoords).toBeInTheDocument();
    expect(screen.getByText(/34\.751900° E/i, { selector: 'span' })).toBeInTheDocument();
  });

  it('shows retry button when map fails to load', async () => {
    global.L = {
      ...mockLeaflet,
      map: vi.fn(() => {
        throw new Error('Failed to load map');
      }),
    } as unknown as typeof global.L;

    render(<FarmPlotSatelliteView {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/map unavailable/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /retry loading map/i })).toBeInTheDocument();
  });

  it('renders map container with correct aria-label', () => {
    render(<FarmPlotSatelliteView {...defaultProps} />);

    const mapContainer = screen.getByRole('region', {
      name: /north field plot a farm plot map - street view/i,
    });
    expect(mapContainer).toBeInTheDocument();
  });

  it('handles keyboard navigation on toggle buttons', async () => {
    const user = userEvent.setup();
    render(<FarmPlotSatelliteView {...defaultProps} />);

    const satelliteButton = screen.getByRole('button', { name: /switch to satellite view/i });
    await user.keyboard('{Tab}');
    await user.keyboard('{Tab}');
    await user.keyboard('{Enter}');

    expect(satelliteButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('applies custom className', () => {
    render(<FarmPlotSatelliteView {...defaultProps} className="custom-class" />);

    const section = screen.getByRole('region', { name: /farm plot location/i });
    expect(section).toHaveClass('custom-class');
  });

  it('displays plot details in footer', () => {
    render(<FarmPlotSatelliteView {...defaultProps} />);

    expect(screen.getByText('North Field Plot A')).toBeInTheDocument();
    expect(screen.getByText(/0\.282700° N/i, { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('PLOT-001')).toBeInTheDocument();
  });

  it('shows accessible location reference text', () => {
    render(<FarmPlotSatelliteView {...defaultProps} />);

    expect(screen.getByText(/interactive farm plot boundary/i)).toBeInTheDocument();
  });

  it('has proper focus styles on buttons', async () => {
    const user = userEvent.setup();
    render(<FarmPlotSatelliteView {...defaultProps} />);

    const streetButton = screen.getByRole('button', { name: /switch to street view/i });
    await user.keyboard('{Tab}');
    expect(streetButton).toHaveFocus();
  });

  it('renders satellite and street icons in toggle buttons', () => {
    render(<FarmPlotSatelliteView {...defaultProps} />);

    const streetIcon = screen
      .getByRole('button', { name: /switch to street view/i })
      .querySelector('svg');
    const satelliteIcon = screen
      .getByRole('button', { name: /switch to satellite view/i })
      .querySelector('svg');

    expect(streetIcon).toBeInTheDocument();
    expect(satelliteIcon).toBeInTheDocument();
  });

  it('displays correct view mode description', () => {
    render(<FarmPlotSatelliteView {...defaultProps} />);

    expect(screen.getByText(/viewing street map view/i)).toBeInTheDocument();
  });

  it('updates description when switching to satellite view', async () => {
    const user = userEvent.setup();
    render(<FarmPlotSatelliteView {...defaultProps} />);

    const satelliteButton = screen.getByRole('button', { name: /switch to satellite view/i });
    await user.click(satelliteButton);

    expect(screen.getByText(/viewing high-resolution satellite imagery/i)).toBeInTheDocument();
  });
});
