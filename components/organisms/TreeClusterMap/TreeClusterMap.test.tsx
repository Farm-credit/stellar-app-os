import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { TreeClusterMap } from './TreeClusterMap';
import { fetchPublicTrees } from '@/lib/api/trees';
import type { TreesResponse, TreeFilterState } from '@/lib/types/tree';
import userEvent from '@testing-library/user-event';

// Mock the API
vi.mock('@/lib/api/trees', () => ({
  fetchPublicTrees: vi.fn(),
}));

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

const mockTreesResponse: TreesResponse = {
  trees: [
    {
      id: '1',
      treeId: 'TREE-001',
      species: 'Teak',
      region: 'Lagos',
      status: 'verified',
      lat: 6.5244,
      lng: 3.3792,
      co2OffsetKgPerYear: 22,
      projectName: 'Lagos Reforestation',
    },
    {
      id: '2',
      treeId: 'TREE-002',
      species: 'Moringa',
      region: 'Lagos',
      status: 'planted',
      lat: 6.5245,
      lng: 3.3793,
      co2OffsetKgPerYear: 15,
      projectName: 'Lagos Reforestation',
    },
    {
      id: '3',
      treeId: 'TREE-003',
      species: 'Mangrove',
      region: 'Abuja',
      status: 'verified',
      lat: 9.0765,
      lng: 7.3986,
      co2OffsetKgPerYear: 30,
      projectName: 'Abuja Green Initiative',
    },
  ],
  speciesOptions: ['Teak', 'Moringa', 'Mangrove'],
  regionOptions: ['Lagos', 'Abuja'],
  statusOptions: ['verified', 'planted'],
  totalCount: 3,
};

const emptyTreesResponse: TreesResponse = {
  trees: [],
  speciesOptions: [],
  regionOptions: [],
  statusOptions: [],
  totalCount: 0,
};

describe('TreeClusterMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    (fetchPublicTrees as Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<TreeClusterMap />);

    expect(screen.getByText(/loading planting coordinates/i)).toBeInTheDocument();
  });

  it('renders map with tree data after loading', async () => {
    (fetchPublicTrees as Mock).mockResolvedValue(mockTreesResponse);

    render(<TreeClusterMap />);

    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });

    expect(screen.getByText(/Displaying 3 verified tree planting locations/i)).toBeInTheDocument();
  });

  it('renders empty state when no trees match filters', async () => {
    (fetchPublicTrees as Mock).mockResolvedValue(emptyTreesResponse);

    render(<TreeClusterMap />);

    await waitFor(() => {
      expect(
        screen.getByText(/No planting locations match the selected species overlay/i)
      ).toBeInTheDocument();
    });
  });

  it('has accessible region label on map container', async () => {
    (fetchPublicTrees as Mock).mockResolvedValue(mockTreesResponse);

    render(<TreeClusterMap />);

    await waitFor(() => {
      const mapContainer = screen.getByTestId('map-container');
      expect(mapContainer).toHaveAttribute('aria-label', 'Verified tree planting cluster map');
    });
  });

  it('provides text alternative summarizing tree count', async () => {
    (fetchPublicTrees as Mock).mockResolvedValue(mockTreesResponse);

    render(<TreeClusterMap />);

    await waitFor(() => {
      expect(
        screen.getByText(/Displaying 3 verified tree planting locations/i)
      ).toBeInTheDocument();
    });
  });

  it('applies responsive classes to map wrapper', async () => {
    (fetchPublicTrees as Mock).mockResolvedValue(mockTreesResponse);

    const { container } = render(<TreeClusterMap />);

    await waitFor(() => {
      const mapWrapper = container.querySelector('.rounded-3xl');
      expect(mapWrapper).toBeInTheDocument();
      expect(mapWrapper).toHaveClass('border-slate-200');
    });
  });

  it('allows filtering by species', async () => {
    (fetchPublicTrees as Mock).mockResolvedValue(mockTreesResponse);
    const user = userEvent.setup();

    render(<TreeClusterMap />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Filter tree clusters by species/i)).toBeInTheDocument();
    });

    const speciesSelect = screen.getByLabelText(/Filter tree clusters by species/i);
    await user.selectOptions(speciesSelect, 'Teak');

    await waitFor(() => {
      expect(fetchPublicTrees).toHaveBeenCalledWith(expect.objectContaining({ species: 'Teak' }));
    });
  });

  it('renders multiple circle markers for clustered trees', async () => {
    (fetchPublicTrees as Mock).mockResolvedValue(mockTreesResponse);

    render(<TreeClusterMap />);

    await waitFor(() => {
      const markers = screen.getAllByTestId('circle-marker');
      expect(markers.length).toBeGreaterThan(0);
    });
  });

  it('shows loading text exclusively when loading', async () => {
    (fetchPublicTrees as Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<TreeClusterMap />);

    expect(screen.getByText(/loading planting coordinates/i)).toBeInTheDocument();
    expect(screen.queryByTestId('map-container')).not.toBeInTheDocument();
  });

  it('has proper heading and description', async () => {
    (fetchPublicTrees as Mock).mockResolvedValue(mockTreesResponse);

    render(<TreeClusterMap />);

    await waitFor(() => {
      expect(screen.getByText('Verified Tree Clusters')).toBeInTheDocument();
      expect(
        screen.getByText(/Explore verified tree plantings in an interactive clustered map/i)
      ).toBeInTheDocument();
    });
  });

  it('initializes with default filters', async () => {
    (fetchPublicTrees as Mock).mockResolvedValue(mockTreesResponse);

    render(<TreeClusterMap />);

    await waitFor(() => {
      expect(fetchPublicTrees).toHaveBeenCalledWith({
        search: '',
        species: 'all',
        region: 'all',
        status: 'all',
      });
    });
  });

  it('renders species filter with all options', async () => {
    (fetchPublicTrees as Mock).mockResolvedValue(mockTreesResponse);

    render(<TreeClusterMap />);

    await waitFor(() => {
      const select = screen.getByLabelText(/Filter tree clusters by species/i);
      expect(select).toBeInTheDocument();
    });

    const select = screen.getByLabelText(/Filter tree clusters by species/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((opt) => opt.value);

    expect(options).toContain('all');
    expect(options).toContain('Teak');
    expect(options).toContain('Moringa');
    expect(options).toContain('Mangrove');
  });

  it('has screen reader label on species select', async () => {
    (fetchPublicTrees as Mock).mockResolvedValue(mockTreesResponse);

    render(<TreeClusterMap />);

    await waitFor(() => {
      const select = screen.getByLabelText(/Filter tree clusters by species/i);
      expect(select).toHaveAccessibleName();
    });
  });

  it('renders error state when fetch fails', async () => {
    (fetchPublicTrees as Mock).mockRejectedValue(new Error('Network error'));

    render(<TreeClusterMap />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Failed to Load Map Data/i)).toBeInTheDocument();
      expect(screen.getByText(/We couldn't load the tree planting locations/i)).toBeInTheDocument();
    });
  });

  it('shows retry button in error state', async () => {
    (fetchPublicTrees as Mock).mockRejectedValue(new Error('Network error'));

    render(<TreeClusterMap />);

    await waitFor(() => {
      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });
  });

  it('retries fetching data when retry button is clicked', async () => {
    (fetchPublicTrees as Mock).mockRejectedValueOnce(new Error('Network error'));
    (fetchPublicTrees as Mock).mockResolvedValueOnce(mockTreesResponse);

    const user = userEvent.setup();
    render(<TreeClusterMap />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /retry/i });
    await user.click(retryButton);

    await waitFor(() => {
      expect(fetchPublicTrees).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
  });

  it('does not render map when in error state', async () => {
    (fetchPublicTrees as Mock).mockRejectedValue(new Error('Network error'));

    render(<TreeClusterMap />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('map-container')).not.toBeInTheDocument();
  });

  it('error state is mutually exclusive with loading and map states', async () => {
    (fetchPublicTrees as Mock).mockRejectedValue(new Error('Network error'));

    render(<TreeClusterMap />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.queryByText(/loading planting coordinates/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('map-container')).not.toBeInTheDocument();
  });

  it('disables species filter during loading', async () => {
    (fetchPublicTrees as Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<TreeClusterMap />);

    const select = screen.getByLabelText(/Filter tree clusters by species/i);
    expect(select).toBeDisabled();
  });

  it('clears error state on successful retry', async () => {
    (fetchPublicTrees as Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockTreesResponse);

    const user = userEvent.setup();
    render(<TreeClusterMap />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /retry/i });
    await user.click(retryButton);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(
        screen.getByText(/Displaying 3 verified tree planting locations/i)
      ).toBeInTheDocument();
    });
  });
});
