'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type MapViewMode = 'street' | 'satellite';

export interface FarmPlotCoordinates {
  latitude: number;
  longitude: number;
}

export interface FarmPlotSatelliteViewProps {
  plotName: string;
  plotLocation: string;
  coordinates: FarmPlotCoordinates;
  plotId?: string;
  showSatelliteToggle?: boolean;
  defaultViewMode?: MapViewMode;
  zoomLevel?: number;
  className?: string;
}

interface LeafletMapInstance {
  remove: () => void;
  invalidateSize: () => void;
  setView: (latLng: [number, number], zoom: number) => LeafletMapInstance;
  on: (event: string, handler: (e: LeafletEvent) => void, context?: unknown) => LeafletMapInstance;
  off: (
    event: string,
    handler?: (e: LeafletEvent) => void,
    context?: unknown
  ) => LeafletMapInstance;
}

interface LeafletEvent {
  target: LeafletMapInstance;
}

interface LeafletLayer {
  addTo: (map: LeafletMapInstance) => LeafletLayer;
  remove?: () => void;
  bindPopup?: (content: string) => LeafletLayer;
}

type LeafletTileLayer = LeafletLayer;

interface LeafletMarker extends LeafletLayer {
  bindPopup: (content: string) => LeafletMarker;
  addTo: (map: LeafletMapInstance) => LeafletMarker;
}

interface LeafletPolygon extends LeafletLayer {
  bindPopup: (content: string) => LeafletPolygon;
  addTo: (map: LeafletMapInstance) => LeafletPolygon;
  setStyle: (style: Record<string, unknown>) => LeafletPolygon;
}

interface LeafletIcon {
  options: Record<string, unknown>;
}

interface LeafletGlobal {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMapInstance;
  tileLayer: (urlTemplate: string, options?: Record<string, unknown>) => LeafletTileLayer;
  marker: (latLng: [number, number], options?: Record<string, unknown>) => LeafletMarker;
  polygon: (latLngs: [number, number][], options?: Record<string, unknown>) => LeafletPolygon;
  icon: (options: Record<string, unknown>) => LeafletIcon;
  DomUtil: {
    get: (id: string) => HTMLElement | null;
  };
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
const FARM_PLOT_ZOOM = 18;

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
  return `${Math.abs(value).toFixed(6)}° ${direction}`;
}

const SATELLITE_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTRIBUTION =
  'Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community';
const STREET_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const STREET_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const FARM_PLOT_STYLE = {
  color: '#14b8a6',
  fillColor: '#2dd4bf',
  fillOpacity: 0.3,
  weight: 2,
  dashArray: '5, 5',
};

const FARM_PLOT_HOVER_STYLE = {
  color: '#0f766e',
  fillColor: '#14b8a6',
  fillOpacity: 0.5,
  weight: 3,
  dashArray: '',
};

function generateFarmPlotBounds(
  centerLat: number,
  centerLng: number,
  sizeInMeters: number = 100
): [number, number][] {
  const latOffset = sizeInMeters / 111320;
  const lngOffset = sizeInMeters / (111320 * Math.cos((centerLat * Math.PI) / 180));

  return [
    [centerLat - latOffset, centerLng - lngOffset],
    [centerLat - latOffset, centerLng + lngOffset],
    [centerLat + latOffset, centerLng + lngOffset],
    [centerLat + latOffset, centerLng - lngOffset],
    [centerLat - latOffset, centerLng - lngOffset],
  ];
}

export function FarmPlotSatelliteView({
  plotName,
  plotLocation,
  coordinates,
  plotId,
  showSatelliteToggle = true,
  defaultViewMode = 'street',
  zoomLevel = FARM_PLOT_ZOOM,
  className,
}: FarmPlotSatelliteViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<LeafletMapInstance | null>(null);
  const streetLayerRef = useRef<LeafletTileLayer | null>(null);
  const satelliteLayerRef = useRef<LeafletTileLayer | null>(null);
  const plotPolygonRef = useRef<LeafletPolygon | null>(null);
  const plotMarkerRef = useRef<LeafletMarker | null>(null);
  const activeLayerRef = useRef<MapViewMode | null>(null);
  const viewModeRef = useRef<MapViewMode>(defaultViewMode);
  const isMapReadyRef = useRef(false);

  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [viewMode, setViewMode] = useState<MapViewMode>(defaultViewMode);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isHoveringPlot, setIsHoveringPlot] = useState(false);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

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
        plotPolygonRef.current = null;
        plotMarkerRef.current = null;
        activeLayerRef.current = null;
        isMapReadyRef.current = false;

        const streetLayer = L.tileLayer(STREET_TILE_URL, {
          attribution: STREET_ATTRIBUTION,
          maxZoom: 19,
        });

        const satelliteLayer = L.tileLayer(SATELLITE_TILE_URL, {
          attribution: SATELLITE_ATTRIBUTION,
          maxZoom: 19,
        });

        const map = L.map(mapContainerRef.current, {
          zoomControl: true,
          scrollWheelZoom: true,
          doubleClickZoom: true,
          boxZoom: true,
          keyboard: true,
          tap: true,
          touchZoom: true,
        }).setView([lat, lng], zoomLevel);

        const initialLayer = viewModeRef.current === 'satellite' ? satelliteLayer : streetLayer;
        initialLayer.addTo(map);
        activeLayerRef.current = viewModeRef.current;

        const plotBounds = generateFarmPlotBounds(lat, lng);
        const polygon = L.polygon(plotBounds, FARM_PLOT_STYLE).addTo(map);
        plotPolygonRef.current = polygon;

        const customIcon = L.icon({
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41],
        });

        const marker = L.marker([lat, lng], { icon: customIcon, draggable: false }).addTo(map);
        plotMarkerRef.current = marker;

        const popupContent = `
          <div style="padding: 4px; font-family: system-ui, sans-serif;">
            <strong style="font-size: 14px;">${escapeHtml(plotName)}</strong><br/>
            <span style="font-size: 12px; color: #666;">${escapeHtml(plotLocation)}</span><br/>
            <span style="font-size: 11px; color: #888;">
              ${formatCoordinate(lat, 'N', 'S')}, ${formatCoordinate(lng, 'E', 'W')}
            </span>
            ${plotId ? `<br/><span style="font-size: 10px; color: #999;">Plot ID: ${escapeHtml(plotId)}</span>` : ''}
          </div>
        `;

        polygon.bindPopup(popupContent);
        marker.bindPopup(popupContent);

        polygon.on('mouseover', () => {
          setIsHoveringPlot(true);
          polygon.setStyle(FARM_PLOT_HOVER_STYLE);
        });

        polygon.on('mouseout', () => {
          setIsHoveringPlot(false);
          polygon.setStyle(FARM_PLOT_STYLE);
        });

        marker.on('mouseover', () => {
          setIsHoveringPlot(true);
          polygon.setStyle(FARM_PLOT_HOVER_STYLE);
        });

        marker.on('mouseout', () => {
          setIsHoveringPlot(false);
          polygon.setStyle(FARM_PLOT_STYLE);
        });

        map.on('zoomend', () => {
          if (plotPolygonRef.current) {
            plotPolygonRef.current.setStyle(FARM_PLOT_STYLE);
          }
        });

        mapInstanceRef.current = map;
        streetLayerRef.current = streetLayer;
        satelliteLayerRef.current = satelliteLayer;
        isMapReadyRef.current = true;

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
      plotPolygonRef.current = null;
      plotMarkerRef.current = null;
      activeLayerRef.current = null;
      isMapReadyRef.current = false;
    };
  }, [lat, lng, plotName, plotLocation, plotId, zoomLevel]);

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

  const handleViewModeChange = (mode: MapViewMode): void => {
    if (mapStatus !== 'ready') {
      return;
    }
    setViewMode(mode);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (mapStatus !== 'ready') {
        return;
      }
      const button = event.currentTarget;
      const mode = button.getAttribute('data-view-mode') as MapViewMode;
      if (mode) {
        setViewMode(mode);
      }
    }
  };

  return (
    <section
      className={cn(
        'space-y-4 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80',
        className
      )}
      aria-labelledby={descriptionId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={descriptionId} className="text-sm font-semibold text-foreground">
            Farm Plot Location
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {plotName} \u2014 {plotLocation} ({latitudeText}, {longitudeText})
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
              data-view-mode="street"
              disabled={mapStatus !== 'ready'}
              className={cn(
                'rounded px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground',
                viewMode === 'street'
                  ? 'bg-stellar-blue text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
              onClick={() => handleViewModeChange('street')}
              onKeyDown={handleKeyDown}
              aria-pressed={viewMode === 'street'}
              aria-label="Switch to street view"
            >
              <span className="flex items-center gap-1">
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                Street
              </span>
            </button>
            <button
              type="button"
              data-view-mode="satellite"
              disabled={mapStatus !== 'ready'}
              className={cn(
                'rounded px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground',
                viewMode === 'satellite'
                  ? 'bg-stellar-blue text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
              onClick={() => handleViewModeChange('satellite')}
              onKeyDown={handleKeyDown}
              aria-pressed={viewMode === 'satellite'}
              aria-label="Switch to satellite view"
            >
              <span className="flex items-center gap-1">
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Satellite
              </span>
            </button>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {viewMode === 'satellite'
          ? 'Viewing high-resolution satellite imagery. Use controls to zoom and pan.'
          : 'Viewing street map view. Toggle to satellite for aerial imagery.'}
        Interactive farm plot boundary shown with teal outline. Hover for details.
      </p>

      <div className="relative overflow-hidden rounded-xl border border-stellar-blue/20 bg-muted/30">
        <div
          ref={mapContainerRef}
          role="region"
          aria-label={`${plotName} farm plot map - ${viewMode} view`}
          className="h-64 w-full sm:h-72 lg:h-80"
          tabIndex={0}
        />

        {mapStatus !== 'ready' ? (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/90 p-4 text-center"
            role="status"
            aria-live="polite"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                {mapStatus === 'loading' && (
                  <svg
                    className="animate-spin h-5 w-5 text-stellar-blue"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                )}
                <p className="text-sm text-muted-foreground">
                  {mapStatus === 'loading'
                    ? 'Loading map...'
                    : `Map unavailable. ${errorMessage || 'Location details shown above.'}`}
                </p>
              </div>
              {mapStatus === 'error' && (
                <button
                  type="button"
                  onClick={() => {
                    setMapStatus('loading');
                    mapInstanceRef.current?.remove();
                    mapInstanceRef.current = null;
                  }}
                  className="text-xs text-stellar-blue hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue focus-visible:ring-offset-2 rounded"
                >
                  Retry loading map
                </button>
              )}
            </div>
          </div>
        ) : null}

        {isHoveringPlot && mapStatus === 'ready' && (
          <div
            className="pointer-events-none absolute bottom-3 left-3 right-3 z-10"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="mx-auto max-w-xs rounded-lg bg-stellar-blue/95 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-sm text-center">
              Hovering farm plot boundary \u2014 Click for details
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {plotName}
        </span>
        <span className="flex items-center gap-1">
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          {latitudeText}, {longitudeText}
        </span>
        {plotId && (
          <span className="flex items-center gap-1">
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            {plotId}
          </span>
        )}
      </div>
    </section>
  );
}
