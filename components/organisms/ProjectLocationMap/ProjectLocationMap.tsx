'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ProjectCoordinates } from '@/lib/types/carbon';
import { cn } from '@/lib/utils';

type MapViewMode = 'street' | 'satellite';

export interface ProjectLocationMapProps {
  projectName: string;
  locationLabel: string;
  coordinates: ProjectCoordinates;
  showSatelliteToggle?: boolean;
  className?: string;
}

interface LeafletMapInstance {
  remove: () => void;
  invalidateSize: () => void;
  // eslint-disable-next-line no-unused-vars
  setView: (latLng: [number, number], zoom: number) => LeafletMapInstance;
}

interface LeafletLayer {
  // eslint-disable-next-line no-unused-vars
  addTo: (map: LeafletMapInstance) => LeafletLayer;
  remove?: () => void;
  // eslint-disable-next-line no-unused-vars
  bindPopup?: (content: string) => LeafletLayer;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface LeafletTileLayer extends LeafletLayer {}

interface LeafletMarker extends LeafletLayer {
  // eslint-disable-next-line no-unused-vars
  bindPopup: (content: string) => LeafletMarker;
  // eslint-disable-next-line no-unused-vars
  addTo: (map: LeafletMapInstance) => LeafletMarker;
}

interface LeafletGlobal {
  // eslint-disable-next-line no-unused-vars
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMapInstance;
  // eslint-disable-next-line no-unused-vars
  tileLayer: (urlTemplate: string, options?: Record<string, unknown>) => LeafletTileLayer;
  // eslint-disable-next-line no-unused-vars
  marker: (latLng: [number, number], options?: Record<string, unknown>) => LeafletMarker;
}

declare global {
  interface Window {
    L?: LeafletGlobal;
  }
}

const LEAFLET_SCRIPT_ID = 'leaflet-cdn-script';
const LEAFLET_STYLES_ID = 'leaflet-cdn-styles';
const LEAFLET_SCRIPT_SRC = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_STYLES_HREF = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const DEFAULT_ZOOM = 6;

let leafletLoaderPromise: Promise<LeafletGlobal> | null = null;

function ensureLeafletStylesheet(): void {
  if (document.getElementById(LEAFLET_STYLES_ID)) {
    return;
  }

  const link = document.createElement('link');
  link.id = LEAFLET_STYLES_ID;
  link.rel = 'stylesheet';
  link.href = LEAFLET_STYLES_HREF;
  link.crossOrigin = '';
  document.head.appendChild(link);
}

function loadLeaflet(): Promise<LeafletGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Leaflet can only load in the browser'));
  }

  if (window.L) {
    return Promise.resolve(window.L);
  }

  if (leafletLoaderPromise) {
    return leafletLoaderPromise;
  }

  leafletLoaderPromise = new Promise<LeafletGlobal>((resolve, reject) => {
    ensureLeafletStylesheet();

    const onLoad = (): void => {
      if (window.L) {
        resolve(window.L);
        return;
      }
      reject(new Error('Leaflet loaded but window.L was unavailable'));
    };

    const onError = (): void => {
      reject(new Error('Failed to load Leaflet from CDN'));
    };

    const existingScript = document.getElementById(LEAFLET_SCRIPT_ID);
    if (existingScript instanceof HTMLScriptElement) {
      existingScript.addEventListener('load', onLoad, { once: true });
      existingScript.addEventListener('error', onError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = LEAFLET_SCRIPT_ID;
    script.src = LEAFLET_SCRIPT_SRC;
    script.async = true;
    script.crossOrigin = '';
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    document.body.appendChild(script);
  }).catch((error: unknown) => {
    leafletLoaderPromise = null;
    throw error;
  });

  return leafletLoaderPromise;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatCoordinate(value: number, positiveLabel: string, negativeLabel: string): string {
  const direction = value >= 0 ? positiveLabel : negativeLabel;
  return `${Math.abs(value).toFixed(4)}° ${direction}`;
}

export function ProjectLocationMap({
  projectName,
  locationLabel,
  coordinates,
  showSatelliteToggle = true,
  className,
}: ProjectLocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<LeafletMapInstance | null>(null);
  const streetLayerRef = useRef<LeafletTileLayer | null>(null);
  const satelliteLayerRef = useRef<LeafletTileLayer | null>(null);
  const activeLayerRef = useRef<MapViewMode | null>(null);

  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [viewMode, setViewMode] = useState<MapViewMode>('street');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const descriptionId = useId();
  const [lat, lng] = [coordinates.latitude, coordinates.longitude];

  useEffect(() => {
    let isCancelled = false;

    async function initializeMap(): Promise<void> {
      if (!mapContainerRef.current) {
        return;
      }

      setMapStatus('loading');
      setErrorMessage('');

      try {
        const L = await loadLeaflet();
        if (isCancelled || !mapContainerRef.current) {
          return;
        }

        mapInstanceRef.current?.remove();
        mapInstanceRef.current = null;
        streetLayerRef.current = null;
        satelliteLayerRef.current = null;
        activeLayerRef.current = null;

        const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        });
        const satelliteLayer = L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          {
            attribution:
              'Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
            maxZoom: 19,
          }
        );

        const map = L.map(mapContainerRef.current, {
          zoomControl: true,
          scrollWheelZoom: false,
        }).setView([lat, lng], DEFAULT_ZOOM);

        if (viewMode === 'satellite') {
          satelliteLayer.addTo(map);
          activeLayerRef.current = 'satellite';
        } else {
          streetLayer.addTo(map);
          activeLayerRef.current = 'street';
        }

        const marker = L.marker([lat, lng]).addTo(map);
        marker.bindPopup?.(
          `<strong>${escapeHtml(projectName)}</strong><br />${escapeHtml(locationLabel)}`
        );

        mapInstanceRef.current = map;
        streetLayerRef.current = streetLayer;
        satelliteLayerRef.current = satelliteLayer;

        setMapStatus('ready');
        requestAnimationFrame(() => {
          map.invalidateSize();
        });
      } catch (error: unknown) {
        if (isCancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load map');
        setMapStatus('error');
      }
    }

    void initializeMap();

    return () => {
      isCancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      streetLayerRef.current = null;
      satelliteLayerRef.current = null;
      activeLayerRef.current = null;
    };
  }, [lat, lng, locationLabel, projectName, viewMode]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const streetLayer = streetLayerRef.current;
    const satelliteLayer = satelliteLayerRef.current;

    if (!map || !streetLayer || !satelliteLayer) {
      return;
    }

    if (activeLayerRef.current === viewMode) {
      return;
    }

    const currentLayer = activeLayerRef.current === 'satellite' ? satelliteLayer : streetLayer;
    const nextLayer = viewMode === 'satellite' ? satelliteLayer : streetLayer;

    currentLayer.remove?.();
    nextLayer.addTo(map);
    activeLayerRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    if (!mapInstanceRef.current) {
      return;
    }

    const handleResize = (): void => {
      mapInstanceRef.current?.invalidateSize();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [mapStatus]);

  const latitudeText = formatCoordinate(lat, 'N', 'S');
  const longitudeText = formatCoordinate(lng, 'E', 'W');

  return (
    <section className={cn('space-y-3', className)} aria-labelledby={descriptionId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={descriptionId} className="text-sm font-semibold text-foreground">
            Project location
          </h3>
          <p className="text-xs text-muted-foreground">
            {locationLabel} ({latitudeText}, {longitudeText})
          </p>
        </div>

        {showSatelliteToggle ? (
          <div
            className="inline-flex rounded-md border border-border bg-background p-1"
            role="group"
            aria-label="Map view mode"
          >
            <button
              type="button"
              className={cn(
                'rounded px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'street'
                  ? 'bg-stellar-blue text-white'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setViewMode('street')}
              aria-pressed={viewMode === 'street'}
            >
              Street
            </button>
            <button
              type="button"
              className={cn(
                'rounded px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'satellite'
                  ? 'bg-stellar-blue text-white'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setViewMode('satellite')}
              aria-pressed={viewMode === 'satellite'}
            >
              Satellite
            </button>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Accessible location reference: {projectName} is located in {locationLabel}. The pin marks
        the project site on the interactive map.
      </p>

      <div className="relative overflow-hidden rounded-lg border border-stellar-blue/20 bg-muted/30">
        <div
          ref={mapContainerRef}
          role="region"
          aria-label={`${projectName} location map`}
          className="h-64 w-full sm:h-72"
        />

        {mapStatus !== 'ready' ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/85 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {mapStatus === 'loading'
                ? 'Loading map...'
                : `Map unavailable. ${errorMessage || 'Location text is shown above.'}`}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
