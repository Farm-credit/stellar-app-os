import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OffsetProjectMap } from '../OffsetProjectMap';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';

// Mock react-leaflet components
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, ...props }: any) => (
    <div data-testid="map-container" {...props}>
      {children}
    </div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  CircleMarker: ({ children }: any) => <div data-testid="circle-marker">{children}</div>,
  Circle: () => <div data-testid="climate-circle" />,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
  Tooltip: ({ children }: any) => <div data-testid="tooltip">{children}</div>,
  useMap: () => ({
    flyTo: vi.fn(),
  }),
}));

// Mock leaflet
vi.mock('leaflet', () => ({
  default: {
    Icon: {
      Default: {
        prototype: { _getIconUrl: null },
        mergeOptions: vi.fn(),
      },
    },
  },
  Icon: {
    Default: {
      prototype: { _getIconUrl: null },
      mergeOptions: vi.fn(),
    },
  },
}));

describe('OffsetProjectMap with Climate Layer', () => {
  it('renders map with climate layer toggle', () => {
    render(<OffsetProjectMap projects={mockCarbonProjects} />);

    expect(screen.getByTestId('offset-project-map-container')).toBeDefined();
    const toggle = screen.getByTestId('climate-layer-toggle');
    expect(toggle).toBeDefined();
    expect(toggle.textContent).toContain('Climate Layer: OFF');
  });

  it('toggles climate layer ON and exposes open meteorological metrics controls', () => {
    render(<OffsetProjectMap projects={mockCarbonProjects} />);

    const toggle = screen.getByTestId('climate-layer-toggle');
    fireEvent.click(toggle);

    expect(toggle.textContent).toContain('Climate Layer: ON');
    // Open meteorological API note is displayed
    expect(
      screen.getByText(/Sourced from open meteorological APIs/i)
    ).toBeDefined();

    // Metric selectors are visible
    expect(screen.getByRole('button', { name: /Rainfall \(mm\)/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Temperature \(°C\)/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Planting Conditions/i })).toBeDefined();

    // Comparison selector is visible
    expect(screen.getByRole('button', { name: /Historical vs Current/i })).toBeDefined();
  });

  it('switches climate metric to temperature and planting conditions', () => {
    render(<OffsetProjectMap projects={mockCarbonProjects} enableClimateLayerByDefault={true} />);

    // Click temperature
    const tempBtn = screen.getByRole('button', { name: /Temperature \(°C\)/i });
    fireEvent.click(tempBtn);
    expect(screen.getByText(/Temperature Scale/i)).toBeDefined();

    // Click planting conditions
    const condBtn = screen.getByRole('button', { name: /Planting Conditions/i });
    fireEvent.click(condBtn);
    expect(screen.getByText(/Planting Conditions/i)).toBeDefined();
  });

  it('renders historical vs current comparison data in popups', () => {
    render(<OffsetProjectMap projects={mockCarbonProjects} enableClimateLayerByDefault={true} />);

    // Check that historical vs current planting climate data is present
    const headings = screen.getAllByText(/Planting Climate Data/i);
    expect(headings.length).toBeGreaterThan(0);

    const openMeteoTags = screen.getAllByText(/Open Meteorological APIs/i);
    expect(openMeteoTags.length).toBeGreaterThan(0);
  });
});
