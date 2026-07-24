'use client';

import { useEffect, useMemo, useState, type JSX } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMapEvents } from 'react-leaflet';
import Link from 'next/link';
import type { RegionMarker } from '@/lib/api/impactData';
import { clusterTreesByRegion } from '@/lib/api/treeClusters';
import type { Tree, TreeStatus } from '@/lib/types/tree';
import 'leaflet/dist/leaflet.css';

interface ImpactMapProps {
  regions?: RegionMarker[];
  trees?: Tree[];
  center?: [number, number];
  zoom?: number;
}

function radiusForTrees(trees: number): number {
  return 8 + Math.min(trees / 40_000, 1) * 32;
}

function colorForStatus(status: TreeStatus): { fill: string; stroke: string } {
  const colors: Record<TreeStatus, { fill: string; stroke: string }> = {
    funded: { fill: '#94a3b8', stroke: '#64748b' },
    planted: { fill: '#14B6E7', stroke: '#0ea5e9' },
    verified: { fill: '#00B36B', stroke: '#059669' },
    completed: { fill: '#3E1BDB', stroke: '#4f46e5' },
    failed: { fill: '#ef4444', stroke: '#dc2626' },
  };
  return colors[status];
}

function ZoomTracker({ onZoom }: { onZoom: (_zoom: number) => void }) {
  useMapEvents({
    zoomend: (e) => onZoom(e.target.getZoom()),
    load: (e) => onZoom(e.target.getZoom()),
  });
  return null;
}

export function ImpactMap({
  regions = [],
  trees = [],
  center = [5, 20],
  zoom: initialZoom = 3,
}: ImpactMapProps): JSX.Element {
  const [zoom, setZoom] = useState(initialZoom);
  const showIndividualMarkers = zoom >= 7;

  const clusters = useMemo(() => clusterTreesByRegion(trees), [trees]);
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

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={false}
      className="h-full w-full rounded-xl"
      aria-label="Live map of verified trees"
    >
      <ZoomTracker onZoom={setZoom} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {regions.map((region) => (
        <CircleMarker
          key={region.id}
          center={[region.lat, region.lng]}
          radius={radiusForTrees(region.treesPlanted)}
          pathOptions={{
            color: '#14B6E7',
            fillColor: '#00B36B',
            fillOpacity: 0.2,
            weight: 2,
          }}
        >
          <Tooltip>
            <strong>{region.name}</strong>
            <br />
            {region.treesPlanted.toLocaleString()} trees
            <br />
            {region.farmers.toLocaleString()} farmers
          </Tooltip>
        </CircleMarker>
      ))}

      {!showIndividualMarkers &&
        clusters.map((cluster) => (
          <CircleMarker
            key={cluster.region}
            center={[cluster.lat, cluster.lng]}
            radius={10 + Math.min(cluster.treeCount * 2, 24)}
            pathOptions={{
              color: '#059669',
              fillColor: '#00B36B',
              fillOpacity: 0.75,
              weight: 2,
            }}
          >
            <Popup>
              <div className="min-w-[180px] space-y-2 text-sm">
                <p className="font-semibold">{cluster.region}</p>
                <p>{cluster.treeCount} verified trees</p>
                <p>{cluster.totalCo2KgPerYear.toFixed(1)} kg CO₂ / year</p>
                <ul className="list-disc pl-4">
                  {Object.entries(cluster.speciesBreakdown).map(([species, count]) => (
                    <li key={species}>
                      {species}: {count}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">Zoom in to see individual trees</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}

      {showIndividualMarkers &&
        trees.map((tree) => {
          const colors = colorForStatus(tree.status);
          return (
            <CircleMarker
              key={tree.id}
              center={[tree.lat, tree.lng]}
              radius={7}
              pathOptions={{
                color: colors.stroke,
                fillColor: colors.fill,
                fillOpacity: 0.85,
                weight: 2,
              }}
            >
              <Popup>
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">{tree.treeId}</p>
                  <p>
                    {tree.species} · {tree.region}
                  </p>
                  <p>{tree.co2OffsetKgPerYear} kg CO₂ / year</p>
                  <Link href={`/trees/${tree.id}`} className="text-stellar-green underline">
                    View tree details
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
    </MapContainer>
  );
}
