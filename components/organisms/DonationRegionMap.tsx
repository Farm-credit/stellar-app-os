'use client';

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import type { RegionMarker } from '@/lib/api/impactData';
import 'leaflet/dist/leaflet.css';

interface DonationRegionMapProps {
  regions: RegionMarker[];
  selectedRegionId: string;
  onSelect: (regionId: string) => void;
}

export function DonationRegionMap({
  regions,
  selectedRegionId,
  onSelect,
}: DonationRegionMapProps) {
  return (
    <MapContainer
      center={[8, 12]}
      zoom={4}
      scrollWheelZoom={false}
      className="h-72 w-full rounded-xl"
      aria-label="Choose a planting region on the map"
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {regions.map((region) => {
        const selected = region.id === selectedRegionId;
        return (
          <CircleMarker
            key={region.id}
            center={[region.lat, region.lng]}
            radius={selected ? 13 : 9}
            pathOptions={{
              color: selected ? '#0f766e' : '#14B6E7',
              fillColor: selected ? '#00B36B' : '#14B6E7',
              fillOpacity: selected ? 0.9 : 0.65,
              weight: selected ? 3 : 2,
            }}
            eventHandlers={{ click: () => onSelect(region.id) }}
          >
            <Popup>
              <strong>{region.name}</strong>
              <br />
              {region.treesPlanted.toLocaleString()} trees planted
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}