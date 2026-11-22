'use client';

import Link from 'next/link';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import type { JSX } from 'react';
import { HEALTH_LABELS, deriveHealth, type TreeHealth } from '@/lib/forest/insights';
import type { Tree } from '@/lib/types/tree';
import 'leaflet/dist/leaflet.css';

export const HEALTH_COLORS: Record<TreeHealth, string> = {
  healthy: '#00b36b',
  establishing: '#14b6e7',
  pending: '#f59e0b',
  at_risk: '#ef4444',
};

const NIGERIA_CENTER: [number, number] = [9.08, 8.68];

/** Leaflet map of a sponsor's trees, coloured by health. Client-only; load via dynamic import. */
export default function ForestMap({ trees }: { trees: Tree[] }): JSX.Element {
  const center: [number, number] = trees.length
    ? [
        trees.reduce((s, t) => s + t.lat, 0) / trees.length,
        trees.reduce((s, t) => s + t.lng, 0) / trees.length,
      ]
    : NIGERIA_CENTER;

  return (
    <MapContainer
      center={center}
      zoom={trees.length > 1 ? 6 : 8}
      scrollWheelZoom={false}
      className="h-[480px] w-full rounded-3xl"
      aria-label="Map of your sponsored trees"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {trees.map((tree) => {
        const health = deriveHealth(tree);
        return (
          <CircleMarker
            key={tree.id}
            center={[tree.lat, tree.lng]}
            radius={9}
            pathOptions={{
              color: HEALTH_COLORS[health],
              fillColor: HEALTH_COLORS[health],
              fillOpacity: 0.7,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <p className="font-bold">{tree.species}</p>
                <p>{tree.region}</p>
                <p>Health: {HEALTH_LABELS[health]}</p>
                <Link
                  href={`/trees/${encodeURIComponent(tree.id)}`}
                  className="font-semibold text-stellar-blue underline"
                >
                  View tree
                </Link>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
