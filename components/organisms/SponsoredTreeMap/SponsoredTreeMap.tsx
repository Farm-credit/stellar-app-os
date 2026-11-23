'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMapEvents } from 'react-leaflet';
import { fetchSponsoredTrees } from '@/lib/api/sponsored-trees';
import { SponsoredTreeMapFilters } from './SponsoredTreeMapFilters';
import type {
  SponsoredTree,
  SponsoredTreeFilters,
  SponsoredTreeFilterOptions,
} from '@/lib/types/sponsored-tree';
import type { TreeSpecies } from '@/lib/types/tree';
import type { LeafletEvent } from 'leaflet';
import type { JSX } from 'react';
import { format } from 'date-fns';
import { LegacyTierBadge } from '@/components/molecules/LegacyTierBadge';
import 'leaflet/dist/leaflet.css';

const DEFAULT_FILTERS: SponsoredTreeFilters = {
  species: 'all',
  plantingYear: 'all',
  sponsor: 'all',
};

const EMPTY_OPTIONS: SponsoredTreeFilterOptions = {
  species: [],
  plantingYears: [],
  sponsors: [],
};

// ── Clustering (follows TreeClusterMap convention) ───────────────────────────

interface ClusterItem {
  id: string;
  lat: number;
  lng: number;
  count: number;
  trees: SponsoredTree[];
  speciesCounts: Partial<Record<TreeSpecies, number>>;
  region: string;
}

function getClusterSize(zoom: number): number {
  return Math.max(0.05, 12 / Math.pow(2, zoom / 1.2));
}

function clusterTrees(trees: SponsoredTree[], zoom: number): ClusterItem[] {
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
      clusters.set(key, {
        id: key,
        lat: tree.lat,
        lng: tree.lng,
        count: 1,
        trees: [tree],
        speciesCounts: { [tree.species]: 1 },
        region: tree.region,
      });
    }
  }

  return Array.from(clusters.values());
}

function getMarkerSize(count: number): number {
  return 8 + Math.min(count, 20) * 1.8;
}

// ── Map sub-components ──────────────────────────────────────────────────────

function MapZoomEvents({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  useMapEvents({
    zoomend(event: LeafletEvent) {
      onZoomChange(event.target.getZoom());
    },
  });
  return null;
}

function formatDate(isoDate: string | undefined): string {
  if (!isoDate) return 'Pending';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return format(date, 'd MMM yyyy');
}

function TreePopupContent({ tree }: { tree: SponsoredTree }) {
  return (
    <div className="min-w-[200px] rounded-2xl border border-white/30 bg-white/90 p-4 shadow-xl backdrop-blur-xl text-slate-900 dark:bg-slate-950/90 dark:text-white">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
        Sponsored Tree
      </p>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Species</dt>
          <dd className="font-semibold">{tree.species}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Tree Ref</dt>
          <dd className="font-mono text-xs">{tree.treeId}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Planted</dt>
          <dd>{formatDate(tree.plantedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Region</dt>
          <dd>{tree.region}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Sponsor</dt>
          <dd className="font-semibold text-stellar-green">{tree.sponsorName}</dd>
          <dd className="mt-2">
            <LegacyTierBadge sponsorName={tree.sponsorName} compact />
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ClusterPopupContent({ cluster }: { cluster: ClusterItem }) {
  const speciesEntries = Object.entries(cluster.speciesCounts).filter(([, v]) => v && v > 0);

  // Collect unique sponsor names from the cluster
  const sponsors = [...new Set(cluster.trees.map((t) => t.sponsorName))];

  return (
    <div className="min-w-[200px] rounded-2xl border border-white/30 bg-white/90 p-4 shadow-xl backdrop-blur-xl text-slate-900 dark:bg-slate-950/90 dark:text-white">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
        Tree Cluster
      </p>
      <p className="mt-2 text-sm font-semibold">
        {cluster.count} sponsored tree{cluster.count > 1 ? 's' : ''}
      </p>
      <div className="mt-3 space-y-1.5">
        {speciesEntries.map(([species, count]) => (
          <div key={species} className="flex items-center justify-between text-sm">
            <span>{species}</span>
            <span className="font-semibold">{count}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Region: {cluster.region}</p>
      {sponsors.length > 0 && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Sponsor{sponsors.length > 1 ? 's' : ''}: {sponsors.join(', ')}
        </p>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

/**
 * SponsoredTreeMap — Interactive Leaflet map showing sponsored tree locations.
 *
 * Displays only trees with verified sponsor attribution and valid coordinates.
 * Supports species, planting year, and sponsor organisation filtering.
 * Implements grid-based marker clustering that expands on zoom.
 *
 * @see TreeClusterMap for the reference implementation this component follows.
 */
export function SponsoredTreeMap(): JSX.Element {
  const [filters, setFilters] = useState<SponsoredTreeFilters>(DEFAULT_FILTERS);
  const [trees, setTrees] = useState<SponsoredTree[]>([]);
  const [filterOptions, setFilterOptions] = useState<SponsoredTreeFilterOptions>(EMPTY_OPTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [zoom, setZoom] = useState(4);

  const loadTrees = useCallback((nextFilters: SponsoredTreeFilters) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = fetchSponsoredTrees(nextFilters);
      setTrees(response.trees);
      setFilterOptions(response.filterOptions);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load sponsored tree data'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrees(filters);
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

  const handleFilterChange = useCallback((nextFilters: SponsoredTreeFilters) => {
    setFilters(nextFilters);
  }, []);

  const handleRetry = useCallback(() => {
    loadTrees(filters);
  }, [filters, loadTrees]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Sponsored Tree Map
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Explore sponsored tree planting locations with interactive filtering by species, planting
          year, and sponsor organisation.
        </p>
      </div>

      {/* Filters */}
      <SponsoredTreeMapFilters
        filters={filters}
        options={filterOptions}
        onFilterChange={handleFilterChange}
        disabled={isLoading}
      />

      {/* Map or error state */}
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
                We couldn&apos;t load the sponsored tree locations. Please try again.
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
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-stellar-green dark:border-slate-700 dark:border-t-stellar-green" />
              </div>
            ) : (
              <MapContainer
                center={[6.5, 12.5]}
                zoom={zoom}
                scrollWheelZoom
                zoomControl
                className="h-[520px] w-full bg-slate-100 dark:bg-slate-900"
                aria-label="Interactive map of sponsored tree planting locations"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapZoomEvents onZoomChange={setZoom} />
                {clusters.map((cluster) => {
                  const isIndividual = cluster.count === 1;
                  const markerSize = getMarkerSize(cluster.count);
                  const fillOpacity = isIndividual ? 0.88 : 0.44;
                  const strokeColor = isIndividual ? '#14b8a6' : '#0f766e';
                  const fillColor = isIndividual ? '#22c55e' : '#2dd4bf';

                  return (
                    <CircleMarker
                      key={cluster.id}
                      center={[cluster.lat, cluster.lng]}
                      radius={markerSize}
                      pathOptions={{
                        color: strokeColor,
                        fillColor,
                        fillOpacity,
                        weight: 2,
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -markerSize]}>
                        {isIndividual
                          ? `${cluster.trees[0].species} · ${cluster.trees[0].sponsorName}`
                          : `${cluster.count} sponsored trees`}
                      </Tooltip>
                      <Popup>
                        {isIndividual ? (
                          <TreePopupContent tree={cluster.trees[0]} />
                        ) : (
                          <ClusterPopupContent cluster={cluster} />
                        )}
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            )}
          </div>

          {/* Accessible text summary */}
          <div
            className="rounded-3xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-300"
            role="status"
            aria-live="polite"
          >
            {isLoading ? (
              <p>Loading sponsored tree locations…</p>
            ) : (
              <p>
                {trees.length === 0
                  ? 'No sponsored trees match the selected filters.'
                  : `Displaying ${trees.length} sponsored tree${trees.length !== 1 ? 's' : ''} across ${clusters.length} map cluster${clusters.length !== 1 ? 's' : ''}.`}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
