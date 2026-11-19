'use client';

import { useEffect, useMemo, type JSX } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  CircleMarker,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Trees, ThermometerSun, Globe2, Sprout, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { PlantingLocation } from '@/lib/db/schema';
import { TREE_SPECIES } from '@/lib/constants/species';

interface PlantingMapProps {
  locations: PlantingLocation[];
  selectedLocationId: number | null;
  onSelectLocation: (id: number | null) => void;
}

const TILE_LAYER_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// ── Map tile providers that DO NOT require an API key ────────────────────────
//
// OpenStreetMap (default, used above) — no API key. Subject to tile usage
// policy: https://operations.osmfoundation.org/policies/tiles/
//
// Alternatives (drop-in replacements for TILE_LAYER_URL):
//   • CARTO Voyager — "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
//   • CARTO Dark    — "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
//   • Stamen Terrain — "https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg"
//
// ── Providers that DO require an API key ─────────────────────────────────────
//
// If you later switch to Mapbox, MapTiler, or Thunderforest, set the key in
// your .env.local and swap TILE_LAYER_URL accordingly:
//   process.env.NEXT_PUBLIC_MAPBOX_TOKEN
//   process.env.NEXT_PUBLIC_MAPTILER_KEY
//   process.env.NEXT_PUBLIC_THUNDERFOREST_KEY

function resolveSpeciesName(slug: string): string {
  return TREE_SPECIES.find((s) => s.slug === slug)?.name ?? slug;
}

function climateIconBg(climate: string): string {
  switch (climate) {
    case 'Tropical':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
    case 'Arid':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    case 'Temperate':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function LocationFlyTo({ locationId, locations }: { locationId: number | null; locations: PlantingLocation[] }) {
  const map = useMap();
  useEffect(() => {
    if (locationId == null) return;
    const loc = locations.find((l) => l.id === locationId);
    if (!loc) return;
    map.flyTo([loc.latitude, loc.longitude], 6, { duration: 0.6 });
  }, [locationId, locations, map]);
  return null;
}

function CustomMarkerIcon() {
  return L.divIcon({
    className: 'custom-planting-marker',
    html: `<div style="
      width: 28px; height: 28px;
      background: #14B6E7;
      border: 3px solid #ffffff;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 8px rgba(20, 182, 231, 0.45);
      display: flex; align-items: center; justify-content: center;
    "><div style="
      transform: rotate(45deg);
      width: 10px; height: 10px;
      background: #00B36B;
      border-radius: 50%;
    "></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

export function PlantingMap({
  locations,
  selectedLocationId,
  onSelectLocation,
}: PlantingMapProps): JSX.Element {
  const bounds = useMemo(() => {
    if (locations.length === 0) return undefined;
    return L.latLngBounds(locations.map((l) => [l.latitude, l.longitude] as L.LatLngTuple));
  }, [locations]);

  const selectedLocation = locations.find((l) => l.id === selectedLocationId) ?? null;

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[10, 10]}
        zoom={2}
        scrollWheelZoom
        className="h-full w-full"
        aria-label="Map of available tree planting locations"
        aria-describedby="planting-map-description"
        style={{ height: '100%', minHeight: '480px', width: '100%' }}
      >
        <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_LAYER_URL} />
        <LocationFlyTo locationId={selectedLocationId} locations={locations} />

        {locations.map((loc) => {
          const isSelected = loc.id === selectedLocationId;
          return (
            <Marker
              key={loc.id}
              position={[loc.latitude, loc.longitude]}
              icon={CustomMarkerIcon()}
              eventHandlers={{
                click: () => onSelectLocation(loc.id),
              }}
              aria-label={`${loc.name} planting location`}
            >
              {!isSelected && (
                <Popup>
                  <div className="min-w-[220px] space-y-2 text-sm">
                    <p className="font-semibold">{loc.name}</p>
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <Globe2 className="size-3.5" aria-hidden="true" />
                      {loc.region}
                    </p>
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <ThermometerSun className="size-3.5" aria-hidden="true" />
                      {loc.climate}
                    </p>
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <Trees className="size-3.5" aria-hidden="true" />
                      {loc.availableCapacity.toLocaleString()} trees remaining
                    </p>
                  </div>
                </Popup>
              )}
              {isSelected && loc.id === selectedLocationId && (
                <CircleMarker
                  center={[loc.latitude, loc.longitude]}
                  radius={32}
                  pathOptions={{
                    color: '#14B6E7',
                    fillColor: '#14B6E7',
                    fillOpacity: 0.1,
                    weight: 2,
                    dashArray: '4 4',
                  }}
                />
              )}
            </Marker>
          );
        })}

        {bounds && locations.length > 1 && (
          <AutoFitBounds bounds={bounds} />
        )}
      </MapContainer>

      <span id="planting-map-description" className="sr-only">
        Click any marker to view details about a planting location. Use the filters
        to narrow results by region, climate, or tree species.
      </span>

      {selectedLocation && (
        <div
          className="pointer-events-auto absolute bottom-4 right-4 z-[400] w-[min(92vw,360px)] shadow-xl"
          role="region"
          aria-label={`Details for ${selectedLocation.name}`}
        >
          <Card className="border-0 shadow-xl">
            <CardHeader className="relative space-y-1 pb-2">
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute right-4 top-4"
                onClick={() => onSelectLocation(null)}
                aria-label={`Close details for ${selectedLocation.name}`}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
              <CardTitle className="flex items-center gap-2 pr-8 text-lg">
                <MapPin className="size-4 text-stellar-blue" aria-hidden="true" />
                {selectedLocation.name}
              </CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Globe2 className="size-3.5" aria-hidden="true" />
                {selectedLocation.region}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground line-clamp-3">
                {selectedLocation.description}
              </p>

              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="secondary"
                  className={climateIconBg(selectedLocation.climate)}
                >
                  <ThermometerSun className="size-3" aria-hidden="true" />
                  {selectedLocation.climate}
                </Badge>
                <Badge variant="outline">
                  <Trees className="size-3" aria-hidden="true" />
                  {selectedLocation.availableCapacity.toLocaleString()} spots
                </Badge>
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sprout className="size-3.5" aria-hidden="true" />
                  Available species
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedLocation.species.map((slug) => (
                    <Badge key={slug} variant="secondary" className="bg-stellar-green/10 text-stellar-green dark:bg-stellar-green/20">
                      {resolveSpeciesName(slug)}
                    </Badge>
                  ))}
                </div>
              </div>

              <Button
                variant="purple"
                size="lg"
                className="w-full"
                onClick={() => {
                  const params = new URLSearchParams({ locationId: String(selectedLocation.id) });
                  window.location.href = `/donate/trees?${params.toString()}`;
                }}
              >
                Sponsor Trees Here
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function AutoFitBounds({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds.pad(0.25));
  }, [bounds, map]);
  return null;
}
