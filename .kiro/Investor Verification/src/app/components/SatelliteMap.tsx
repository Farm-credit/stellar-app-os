import React, { useState, useEffect, useRef } from 'react';
import L, { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers } from 'lucide-react';

interface HealthZone {
  id: string;
  coordinates: LatLngExpression[][];
  ndvi: number;
  label: string;
}

interface SatelliteMapProps {
  farmName: string;
  center: LatLngExpression;
  healthZones: HealthZone[];
}

const MapLegend = () => {
  return (
    <div className="absolute top-4 right-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-4 border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <Layers className="w-4 h-4 text-gray-700" />
        <h3 className="text-sm font-semibold text-gray-800">NDVI Health Index</h3>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-500"></div>
          <span className="text-xs text-gray-700">Healthy (0.6 - 1.0)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-500"></div>
          <span className="text-xs text-gray-700">Moderate (0.3 - 0.6)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-500"></div>
          <span className="text-xs text-gray-700">At Risk (&lt; 0.3)</span>
        </div>
      </div>
    </div>
  );
};

const getHealthColor = (ndvi: number): string => {
  if (ndvi >= 0.6) return '#22c55e';
  if (ndvi >= 0.3) return '#eab308';
  return '#ef4444';
};

const getHealthOpacity = (ndvi: number): number => {
  return 0.4 + (ndvi * 0.3);
};

export const SatelliteMap: React.FC<SatelliteMapProps> = ({ farmName, center, healthZones }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polygonsRef = useRef<L.Polygon[]>([]);
  const [overlayVisible, setOverlayVisible] = useState(true);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Initialize map
    const map = L.map(mapRef.current).setView(center, 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapInstanceRef.current = map;

    // Add polygons
    healthZones.forEach((zone) => {
      const polygon = L.polygon(zone.coordinates as L.LatLngExpression[][], {
        color: getHealthColor(zone.ndvi),
        fillColor: getHealthColor(zone.ndvi),
        fillOpacity: getHealthOpacity(zone.ndvi),
        weight: 2,
      }).addTo(map);

      polygon.bindPopup(`
        <div style="font-size: 14px;">
          <p style="font-weight: 600; margin-bottom: 4px;">${zone.label}</p>
          <p style="color: #6b7280;">NDVI: ${zone.ndvi.toFixed(2)}</p>
          <p style="color: #6b7280;">
            Status: ${zone.ndvi >= 0.6 ? 'Healthy' : zone.ndvi >= 0.3 ? 'Moderate' : 'At Risk'}
          </p>
        </div>
      `);

      polygonsRef.current.push(polygon);
    });

    // Cleanup on unmount
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      polygonsRef.current = [];
    };
  }, [center, healthZones]);

  useEffect(() => {
    polygonsRef.current.forEach((polygon) => {
      if (overlayVisible) {
        polygon.addTo(mapInstanceRef.current!);
      } else {
        polygon.remove();
      }
    });
  }, [overlayVisible]);

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden border border-gray-200">
      <div ref={mapRef} className="w-full h-full z-0" />

      <MapLegend />

      <div className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg px-4 py-2 border border-gray-200">
        <h2 className="text-sm font-semibold text-gray-800">{farmName}</h2>
      </div>

      <button
        onClick={() => setOverlayVisible(!overlayVisible)}
        className="absolute bottom-4 right-4 z-[1000] bg-white hover:bg-gray-50 rounded-lg shadow-lg px-4 py-2 text-sm font-medium border border-gray-200 transition-colors"
      >
        {overlayVisible ? 'Hide' : 'Show'} Health Overlay
      </button>
    </div>
  );
};
