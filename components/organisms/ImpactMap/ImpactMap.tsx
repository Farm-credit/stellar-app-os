'use client';

import { useEffect, type JSX } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import type { RegionMarker } from '@/app/api/impact/route';
import 'leaflet/dist/leaflet.css';

interface ImpactMapProps {
  regions: RegionMarker[];
}

function radiusForTrees(trees: number): number {
  return 8 + Math.min(trees / 40_000, 1) * 32;
}

export function ImpactMap({ regions }: ImpactMapProps): JSX.Element {
  useEffect(() => {
    // Fix Leaflet default icon path issue in Next.js
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
      center={[5, 20]}
      zoom={3}
      scrollWheelZoom={false}
      className="h-full w-full rounded-xl"
      aria-label="Planting locations map"
    >
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
            fillOpacity: 0.55,
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
    </MapContainer>
  );
}
