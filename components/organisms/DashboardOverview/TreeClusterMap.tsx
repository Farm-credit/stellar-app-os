'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
  ZoomControl,
  ScaleControl,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Tree, TreeFilterState, TreeSpecies } from '@/lib/types/tree';
import { fetchPublicTrees } from '@/lib/api/trees';
import { ChevronDown, Leaf } from 'lucide-react';

const DEFAULT_CENTER: [number, number] = [5, 20];
const DEFAULT_ZOOM = 3;
const CLUSTER_GRID_SIZE = 72;

interface TreeClusterMapProps {
  className?: string;
}

interface MapCluster {
  id: string;
  center: [number, number];
  count: number;
  trees: Tree[];
  bounds: L.LatLngBounds;
}

function createClusterIcon(count: number, color = '#14B6E7'): L.DivIcon {
  return L.divIcon({
    className: 'tree-cluster-icon',
    html: `
      <div style="display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:9999px;background:${color};color:#ffffff;font-weight:700;box-shadow:0 16px 40px rgba(0,0,0,0.18);border:2px solid rgba(255,255,255,0.92);font-size:0.9rem;">
        ${count}
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function initializeLeafletIcons() {
  if (typeof window === 'undefined' || !L.Icon.Default) {
    return;
  }

  // Ensure default Leaflet marker assets are available when using Next.js.
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

function ClusterLayer({ trees }: { trees: Tree[] }) {
  const map = useMap();
  const [clusters, setClusters] = useState<MapCluster[]>([]);

  const updateClusters = useCallback(() => {
    if (!map || trees.length === 0) {
      setClusters([]);
      return;
    }

    const buckets = new Map<string, { totalLat: number; totalLng: number; trees: Tree[]; bounds: L.LatLngBounds }>();

    trees.forEach((tree) => {
      const point = map.latLngToLayerPoint([tree.lat, tree.lng]);
      const key = `${Math.round(point.x / CLUSTER_GRID_SIZE)}-${Math.round(point.y / CLUSTER_GRID_SIZE)}`;
      const treeLatLng = L.latLng(tree.lat, tree.lng);
      const existing = buckets.get(key);

      if (existing) {
        existing.totalLat += tree.lat;
        existing.totalLng += tree.lng;
        existing.trees.push(tree);
        existing.bounds.extend(treeLatLng);
      } else {
        buckets.set(key, {
          totalLat: tree.lat,
          totalLng: tree.lng,
          trees: [tree],
          bounds: L.latLngBounds(treeLatLng, treeLatLng),
        });
      }
    });

    setClusters(
      Array.from(buckets.entries()).map(([key, bucket]) => ({
        id: key,
        center: [bucket.totalLat / bucket.trees.length, bucket.totalLng / bucket.trees.length],
        count: bucket.trees.length,
        trees: bucket.trees,
        bounds: bucket.bounds,
      }))
    );
  }, [map, trees]);

  useMapEvents({ moveend: updateClusters, zoomend: updateClusters, resize: updateClusters });

  useEffect(() => {
    updateClusters();
  }, [updateClusters]);

  if (clusters.length === 0) {
    return null;
  }

  return (
    <>
      {clusters.map((cluster) => {
        if (cluster.count > 1) {
          return (
            <Marker
              key={cluster.id}
              position={cluster.center}
              icon={createClusterIcon(cluster.count)}
              eventHandlers={{
                click: () => {
                  map.flyToBounds(cluster.bounds, { padding: [64, 64], duration: 0.35 });
                },
              }}
            >
              <Popup className="max-w-xs rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-2xl shadow-slate-950/10 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-950/90">
                <div className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Cluster summary
                  </p>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                    {cluster.count.toLocaleString()} verified trees
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Click to zoom into this cluster and explore exact plantings.
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-900">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Regions</p>
                      <p className="mt-2 font-semibold">{new Set(cluster.trees.map((tree) => tree.region)).size}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-900">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Species</p>
                      <p className="mt-2 font-semibold">{new Set(cluster.trees.map((tree) => tree.species)).size}</p>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        }

        const tree = cluster.trees[0];
        return (
          <Marker key={tree.id} position={cluster.center}>
            <Popup className="max-w-xs rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-2xl shadow-slate-950/10 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-950/90">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-stellar-blue/10 text-stellar-blue">
                    <Leaf className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Verified tree
                    </p>
                    <p className="text-xl font-semibold text-slate-900 dark:text-white">{tree.treeId}</p>
                  </div>
                </div>
                <div className="grid gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <div className="rounded-3xl bg-slate-100 p-3 dark:bg-slate-900">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Species</p>
                    <p className="mt-1 font-semibold">{tree.species}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-100 p-3 dark:bg-slate-900">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Region</p>
                    <p className="mt-1 font-semibold">{tree.region}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-3xl bg-slate-100 p-3 dark:bg-slate-900">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Latitude</p>
                      <p className="mt-1 font-semibold">{tree.lat.toFixed(4)}°</p>
                    </div>
                    <div className="rounded-3xl bg-slate-100 p-3 dark:bg-slate-900">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Longitude</p>
                      <p className="mt-1 font-semibold">{tree.lng.toFixed(4)}°</p>
                    </div>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export function TreeClusterMap({ className }: TreeClusterMapProps) {
  const [filters, setFilters] = useState<TreeFilterState>({
    search: '',
    species: 'all',
    region: 'all',
    status: 'verified',
  });
  const [trees, setTrees] = useState<Tree[]>([]);
  const [speciesOptions, setSpeciesOptions] = useState<TreeSpecies[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializeLeafletIcons();
  }, []);

  const loadTrees = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchPublicTrees(filters);
      setTrees(response.trees);
      setSpeciesOptions(response.speciesOptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tree locations');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadTrees();
  }, [loadTrees]);

  const filteredSpecies = useMemo(() => filters.species, [filters.species]);

  return (
    <div className={className ?? ''}>
      <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
        <div className="absolute inset-x-6 top-6 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white/75 bg-white/90 p-4 shadow-lg shadow-slate-950/5 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-950/80">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Verified Plantings</p>
            <p className="text-base font-semibold text-slate-900 dark:text-white">Tree cluster map</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-300">Species</span>
            <div className="relative">
              <select
                aria-label="Filter tree species"
                value={filteredSpecies}
                onChange={(event) => setFilters((prev) => ({ ...prev, species: event.target.value as TreeSpecies | 'all' }))}
                className="rounded-3xl border border-slate-300 bg-white py-2 pl-4 pr-10 text-sm font-medium text-slate-900 outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="all">All species</option>
                {speciesOptions.map((species) => (
                  <option key={species} value={species}>
                    {species}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>

        <div className="h-[560px] w-full pt-28 sm:pt-32">
          {isLoading ? (
            <div className="flex h-full items-center justify-center bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
              Loading verified tree locations...
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center bg-slate-100 p-6 text-center text-sm text-destructive dark:bg-slate-900">
              {error}
            </div>
          ) : (
            <MapContainer
              center={DEFAULT_CENTER}
              zoom={DEFAULT_ZOOM}
              scrollWheelZoom={true}
              className="h-full w-full"
              zoomControl={false}
              aria-label="Interactive tree planting cluster map"
            >
              <ZoomControl position="topright" />
              <ScaleControl position="bottomleft" />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <ClusterLayer trees={trees} />
            </MapContainer>
          )}
        </div>

        <div className="absolute bottom-6 left-6 right-6 z-20 rounded-[28px] border border-white/70 bg-slate-950/70 p-4 text-sm text-slate-100 shadow-2xl shadow-slate-950/20 backdrop-blur-xl dark:border-slate-700/70">
          <p className="font-semibold">Zoom and cluster</p>
          <p className="mt-2 text-sm text-slate-300">
            Pan the map to inspect verified tree plantings and use the species filter to isolate clusters.
          </p>
        </div>
      </div>
    </div>
  );
}
