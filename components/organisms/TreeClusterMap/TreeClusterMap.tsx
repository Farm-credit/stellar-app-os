'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMapEvents } from 'react-leaflet';
import { fetchPublicTrees } from '@/lib/api/trees';
import type { Tree, TreeFilterState, TreeSpecies } from '@/lib/types/tree';
import type { JSX } from 'react';
import type { LeafletEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_FILTERS: TreeFilterState = {
  search: '',
  species: 'all',
  region: 'all',
  status: 'all',
};

interface ClusterItem {
  id: string;
  lat: number;
  lng: number;
  count: number;
  trees: Tree[];
  speciesCounts: Partial<Record<TreeSpecies, number>>;
  region: string;
}

function getClusterSize(zoom: number): number {
  return Math.max(0.05, 12 / Math.pow(2, zoom / 1.2));
}

function clusterTrees(trees: Tree[], zoom: number): ClusterItem[] {
  const gridSize = getClusterSize(zoom);
  const clusters = new Map<string, ClusterItem>();

  for (const tree of trees) {
    const key = `${Math.round(tree.lat / gridSize)}-${Math.round(tree.lng / gridSize)}`;
    const existing = clusters.get(key);

    if (existing) {
      existing.count += 1;
      existing.trees.push(tree);
      existing.lat = (existing.lat * (existing.count - 1) + tree.lat) / existing.count;
      existing.lng = (existing.lng * (existing.count - 1) + tree.lng) / existing.count;
      existing.speciesCounts[tree.species] = (existing.speciesCounts[tree.species] || 0) + 1;
    } else {
      const speciesCounts: Record<TreeSpecies, number> = {
        Teak: 0,
        Moringa: 0,
        Eucalyptus: 0,
        Mangrove: 0,
        Acacia: 0,
        Neem: 0,
        'African Mahogany': 0,
        Baobab: 0,
        'Bamboo (Moso)': 0,
        'West African Cedar': 0,
        'Caribbean Pine': 0,
        Iroko: 0,
        Shea: 0,
        Cashew: 0,
        'African Locust Bean': 0,
      };
      speciesCounts[tree.species] = 1;

      clusters.set(key, {
        id: key,
        lat: tree.lat,
        lng: tree.lng,
        count: 1,
        trees: [tree],
        speciesCounts,
        region: tree.region,
      });
    }
  }

  return Array.from(clusters.values());
}

function getMarkerSize(count: number): number {
  return 8 + Math.min(count, 20) * 1.8;
}

function formatPopupDetails(cluster: ClusterItem) {
  const speciesEntries = Object.entries(cluster.speciesCounts).filter(([, value]) => value > 0);

  return (
    <div className="rounded-[28px] border border-white/30 bg-white/80 p-4 shadow-2xl backdrop-blur-xl text-slate-900 dark:bg-slate-950/80 dark:text-white">
      <p className="text-[11px] uppercase tracking-[0.34em] text-slate-500 dark:text-slate-400">
        Clustered Coordinates
      </p>
      <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
        {cluster.lat.toFixed(4)}, {cluster.lng.toFixed(4)}
      </p>
      <p className="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
        {cluster.count} verified tree{cluster.count > 1 ? 's' : ''}
      </p>
      <div className="mt-3 space-y-2">
        {speciesEntries.map(([species, value]) => (
          <div key={species} className="flex items-center justify-between text-sm">
            <span>{species}</span>
            <span className="font-semibold text-slate-900 dark:text-white">{value}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Region: {cluster.region}</p>
    </div>
  );
}

function MapZoomEvents({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  useMapEvents({
    zoomend(event: LeafletEvent) {
      onZoomChange(event.target.getZoom());
    },
  });
  return null;
}

/**
 * TreeClusterMap - Interactive Leaflet map visualizing tree planting sites with geo-clustering
 *
 * @description
 * Displays verified tree planting locations on an interactive map using Leaflet.
 * Trees are dynamically clustered based on zoom level using a grid-based algorithm.
 * Supports filtering by species, displays detailed popups, and provides full accessibility.
 *
 * @features
 * - Dynamic geo-clustering with zoom-responsive grid sizing
 * - Species filtering with real-time map updates
 * - Interactive popups showing cluster details (coordinates, species breakdown, count)
 * - Accessible: ARIA labels, keyboard navigation, screen reader summary
 * - Responsive: mobile, tablet, desktop via Tailwind breakpoints
 * - Loading and error states with retry capability
 * - SSR-safe via dynamic import wrapper (TreeClusterMapClient)
 *
 * @data
 * Fetches tree data from `fetchPublicTrees()` API.
 * Each tree includes: id, treeId, species, region, status, lat, lng, co2OffsetKgPerYear, projectName
 *
 * @accessibility
 * - Map region has aria-label for screen readers
 * - Species filter has accessible label
 * - Text summary below map provides non-visual alternative
 * - Keyboard navigable
 *
 * @clustering
 * Uses grid-based spatial clustering. Grid size adapts to zoom level:
 * - Lower zoom = larger grid cells = more aggressive clustering
 * - Higher zoom = smaller grid cells = individual trees visible
 *
 * @tile-provider
 * OpenStreetMap tiles via https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
 * No API key required for OSM tiles.
 *
 * @example
 * ```tsx
 * import { TreeClusterMapClient } from '@/components/organisms/TreeClusterMap/TreeClusterMapClient';
 *
 * <TreeClusterMapClient />
 * ```
 */
export function TreeClusterMap(): JSX.Element {
  const [filters, setFilters] = useState<TreeFilterState>(DEFAULT_FILTERS);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [speciesOptions, setSpeciesOptions] = useState<TreeSpecies[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [zoom, setZoom] = useState(4);

  const loadTrees = useCallback(async (nextFilters: TreeFilterState) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchPublicTrees(nextFilters);
      setTrees(response.trees);
      setSpeciesOptions(response.speciesOptions);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load tree data'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTrees(filters);
  }, [filters, loadTrees]);

  useEffect(() => {
    void import('leaflet').then((L) => {
      // @ts-expect-error — Leaflet internal
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
    });
  }, []);

  const clusters = useMemo(() => clusterTrees(trees, zoom), [trees, zoom]);

  const handleFilterUpdate = useCallback((partial: Partial<TreeFilterState>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleRetry = useCallback(() => {
    void loadTrees(filters);
  }, [filters, loadTrees]);

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Verified Tree Clusters
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              Explore verified tree plantings in an interactive clustered map with species overlays
              and coordinate popups.
            </p>
          </div>
          <div className="max-w-xs">
            <label htmlFor="dashboard-tree-species-filter" className="sr-only">
              Species filter
            </label>
            <select
              id="dashboard-tree-species-filter"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              value={filters.species}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                handleFilterUpdate({ species: event.target.value as TreeSpecies | 'all' })
              }
              aria-label="Filter tree clusters by species"
              disabled={isLoading}
            >
              <option value="all">All species</option>
              {speciesOptions.map((species) => (
                <option key={species} value={species}>
                  {species}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-3xl border border-red-200 bg-red-50/80 p-6 shadow-sm backdrop-blur-xl dark:border-red-900/50 dark:bg-red-950/30"
        >
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/50">
              <svg
                className="h-6 w-6 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-red-900 dark:text-red-200">
                Failed to Load Map Data
              </h3>
              <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                We couldn&apos;t load the tree planting locations. Please check your connection and
                try again.
              </p>
            </div>
            <button
              onClick={handleRetry}
              className="rounded-2xl border border-red-300 bg-white px-6 py-2 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/50"
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            className="overflow-hidden rounded-3xl border border-slate-200 shadow-sm dark:border-slate-800"
            style={{ minHeight: '520px' }}
          >
            {isLoading ? (
              <div className="flex h-[520px] w-full items-center justify-center bg-slate-100 dark:bg-slate-900">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-stellar-blue dark:border-slate-700 dark:border-t-stellar-blue" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Loading planting coordinates...
                  </p>
                </div>
              </div>
            ) : (
              <MapContainer
                center={[6.5, 12.5]}
                zoom={zoom}
                scrollWheelZoom
                zoomControl
                className="h-[520px] w-full bg-slate-100 dark:bg-slate-900"
                aria-label="Verified tree planting cluster map"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapZoomEvents onZoomChange={setZoom} />
                {clusters.map((cluster) => {
                  const markerSize = getMarkerSize(cluster.count);
                  const fillOpacity = cluster.count > 1 ? 0.44 : 0.88;
                  const strokecolor = cluster.count > 1 ? '#0f766e' : '#14b8a6';
                  const fillColor = cluster.count > 1 ? '#2dd4bf' : '#22c55e';

                  return (
                    <CircleMarker
                      key={cluster.id}
                      center={[cluster.lat, cluster.lng]}
                      radius={markerSize}
                      pathOptions={{
                        color: strokecolor,
                        fillColor,
                        fillOpacity,
                        weight: 2,
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -markerSize]}>
                        {cluster.count > 1
                          ? `${cluster.count} verified tree${cluster.count > 1 ? 's' : ''}`
                          : `${cluster.trees[0].species} · ${cluster.trees[0].region}`}
                      </Tooltip>
                      <Popup>{formatPopupDetails(cluster)}</Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            )}
          </div>

          <div
            className="rounded-3xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-300"
            role="status"
            aria-live="polite"
          >
            {isLoading ? (
              <p>Loading planting coordinates...</p>
            ) : (
              <p>
                {trees.length === 0
                  ? 'No planting locations match the selected species overlay.'
                  : `Displaying ${trees.length} verified tree planting locations grouped into ${clusters.length} dynamic map clusters.`}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
