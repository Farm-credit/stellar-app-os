'use client';

import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PlanterJob } from '@/lib/api/planters';

interface PlanterEvidenceMapProps {
  jobs: PlanterJob[];
}

function FitMapToJobs({ jobs }: PlanterEvidenceMapProps) {
  const map = useMap();

  useEffect(() => {
    const bounds = jobs.map(
      (job) => [job.coordinates.latitude, job.coordinates.longitude] as [number, number]
    );
    if (bounds.length > 0) {
      map.fitBounds(bounds as LatLngBoundsExpression, { padding: [28, 28], maxZoom: 12 });
    }
  }, [jobs, map]);

  return null;
}

export function PlanterEvidenceMap({ jobs }: PlanterEvidenceMapProps) {
  const firstJob = jobs[0];
  if (!firstJob) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <MapContainer
        center={[firstJob.coordinates.latitude, firstJob.coordinates.longitude]}
        zoom={6}
        scrollWheelZoom={false}
        className="h-[360px] w-full"
        aria-label="Map of planter-uploaded GPS locations"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitMapToJobs jobs={jobs} />
        {jobs.map((job) => (
          <Marker key={job.id} position={[job.coordinates.latitude, job.coordinates.longitude]}>
            <Popup>
              <strong>{job.title}</strong>
              <br />
              {job.location}
              <br />
              {job.coordinates.latitude.toFixed(5)}, {job.coordinates.longitude.toFixed(5)}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}