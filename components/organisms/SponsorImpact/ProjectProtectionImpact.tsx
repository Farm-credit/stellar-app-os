'use client';
import { Circle, CircleMarker, MapContainer, TileLayer } from 'react-leaflet';
import { BookOpen, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import type { ProjectCoordinates } from '@/lib/types/carbon';
import 'leaflet/dist/leaflet.css';
export function ProjectProtectionImpact({
  projectName,
  coordinates,
}: {
  projectName: string;
  coordinates: ProjectCoordinates;
}) {
  const center: [number, number] = [coordinates.latitude, coordinates.longitude];
  return (
    <Card className="overflow-hidden border-stellar-green/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-stellar-green" />
          Deforestation prevention impact
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Existing forest inside this project’s monitored buffer zone is protected from
          deforestation risk.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-stellar-green/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Protected area
            </p>
            <p className="mt-1 text-3xl font-black text-stellar-green">34.6 ha</p>
            <p className="text-xs text-muted-foreground">Project-level verified estimate</p>
          </div>
          <div className="rounded-xl bg-stellar-blue/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Buffer zone
            </p>
            <p className="mt-1 text-3xl font-black text-stellar-blue">500 m</p>
            <p className="text-xs text-muted-foreground">Monitored from project boundary</p>
          </div>
        </div>
        <div className="h-64 overflow-hidden rounded-xl">
          <MapContainer
            center={center}
            zoom={12}
            scrollWheelZoom={false}
            className="h-full w-full"
            aria-label={`Buffer protection zone map for ${projectName}`}
          >
            <TileLayer
              attribution="© OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Circle
              center={center}
              radius={500}
              pathOptions={{ color: '#16a34a', fillColor: '#22c55e', fillOpacity: 0.22, weight: 2 }}
            />
            <CircleMarker
              center={center}
              radius={7}
              pathOptions={{ color: '#0d0b21', fillColor: '#16a34a', fillOpacity: 1 }}
            />
          </MapContainer>
        </div>
        <p className="flex gap-2 text-xs leading-5 text-muted-foreground">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-stellar-blue" />
          Methodology: Joppa et al. (2016), peer-reviewed analysis of protected-area effectiveness
          and deforestation risk, combined with satellite MRV and project boundary data. Estimates
          are reviewed at each monitoring cycle.
        </p>
      </CardContent>
    </Card>
  );
}
