'use client';

/**
 * ForestProtectionZoneMap — inner Leaflet component (loaded with ssr:false).
 *
 * Implements issue #1714 — Forest Protection Zone Designation for Project Buffers.
 *
 * Renders the buffer zone polygon on the project map and highlights any
 * deforestation detection alert with a distinct red boundary.
 */

import { useEffect, type JSX } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, CircleMarker } from 'react-leaflet';
import type L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ProjectBufferZone } from '@/lib/types/adminProject';
import type { DeforestationAlert } from '@/lib/deforestation/types';

interface ForestProtectionZoneMapProps {
  bufferZone: ProjectBufferZone;
  /** Optional project centroid to show with a marker (lat, lng). */
  center?: [number, number];
  zoom?: number;
  /** Detected canopy-loss areas to highlight (issue #672). */
  alerts?: DeforestationAlert[];
}

/** Convert [lng, lat] buffer coordinates to Leaflet's [lat, lng] tuples. */
function toLeafletPositions(coords: Array<[number, number]>): L.LatLngTuple[] {
  return coords.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
}

/** Compute the centroid of a polygon from its vertices. */
function polygonCentroid(coords: Array<[number, number]>): [number, number] {
  const n = coords.length;
  const sumLat = coords.reduce((acc, [, lat]) => acc + lat, 0);
  const sumLng = coords.reduce((acc, [lng]) => acc + lng, 0);
  return [sumLat / n, sumLng / n];
}

export function ForestProtectionZoneMap({
  bufferZone,
  center,
  zoom = 9,
  alerts = [],
}: ForestProtectionZoneMapProps): JSX.Element {
  // Fix Leaflet's default icon paths when running in Next.js
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

  const positions = toLeafletPositions(bufferZone.polygonCoordinates);
  const mapCenter =
    center ?? (polygonCentroid(bufferZone.polygonCoordinates).reverse() as [number, number]);

  const polygonStyle: L.PathOptions = bufferZone.deforestationAlert
    ? {
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.15,
        weight: 2.5,
        dashArray: '8 5',
      }
    : {
        color: '#00b36b',
        fillColor: '#00b36b',
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '6 4',
      };

  return (
    <MapContainer
      center={mapCenter}
      zoom={zoom}
      scrollWheelZoom={false}
      className="h-full w-full rounded-xl"
      aria-label="Forest protection buffer zone map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Buffer zone polygon */}
      <Polygon positions={positions} pathOptions={polygonStyle}>
        <Tooltip sticky>
          <div className="space-y-1 text-sm">
            <p className="font-semibold">
              {bufferZone.designationLabel ?? 'Forest Protection Buffer Zone'}
            </p>
            <p>Area: {bufferZone.areaHectares.toLocaleString()} ha</p>
            {bufferZone.deforestationAlert || alerts.length > 0 ? (
              <p className="text-red-600 font-medium">⚠ Deforestation detected</p>
            ) : (
              <p className="text-emerald-600">✓ No deforestation detected</p>
            )}
            {bufferZone.lastCheckedAt && (
              <p className="text-xs text-gray-500">
                Last checked:{' '}
                {new Date(bufferZone.lastCheckedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            )}
          </div>
        </Tooltip>
      </Polygon>

      {/* Detected canopy-loss areas (issue #672) */}
      {alerts.map((alert) => (
        <Polygon
          key={alert.id}
          positions={toLeafletPositions(alert.affectedAreaPolygon)}
          pathOptions={{
            color: '#dc2626',
            fillColor: '#ef4444',
            fillOpacity: 0.45,
            weight: 2,
          }}
        >
          <Tooltip sticky>
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-red-600">⚠ Canopy loss detected</p>
              <p>Detected: {alert.detectedOn}</p>
              {alert.areaHectares > 0 && (
                <p>Affected area: {alert.areaHectares.toLocaleString()} ha</p>
              )}
              <p>Confidence: {alert.confidence}</p>
              <p className="text-xs text-gray-500">
                Source: {alert.source === 'gfw' ? 'Global Forest Watch' : 'GFW alert feed (mock)'}
              </p>
            </div>
          </Tooltip>
        </Polygon>
      ))}

      {/* Project centroid dot */}
      {center && (
        <CircleMarker
          center={center}
          radius={8}
          pathOptions={{
            color: '#14b6e7',
            fillColor: '#14b6e7',
            fillOpacity: 0.9,
            weight: 2,
          }}
        >
          <Tooltip>Project site</Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
