'use client';

import { Suspense, useMemo, type JSX } from 'react';
import Link from 'next/link';
import { OffsetProjectMapWrapper } from '@/components/organisms/OffsetProjectMap/OffsetProjectMapWrapper';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';

/**
 * Radius (in kilometers) of the designated forest protection buffer zone
 * drawn around each reforestation project.
 */
const PROTECTION_BUFFER_RADIUS_KM = 5;

/**
 * Approximate area of a circular buffer zone in hectares.
 * 1 km² = 100 hectares.
 */
const PROTECTION_BUFFER_AREA_HA = Math.round(
  Math.PI * PROTECTION_BUFFER_RADIUS_KM * PROTECTION_BUFFER_RADIUS_KM * 100
);

/**
 * Builds a GeoJSON-style polygon approximating a circular buffer zone
 * around the given coordinates.
 */
function buildBufferPolygon(
  latitude: number,
  longitude: number,
  radiusKm: number,
  segments = 32
): [number, number][] {
  const coords: [number, number][] = [];
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos((latitude * Math.PI) / 180) || 1);

  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * 2 * Math.PI;
    coords.push([longitude + lngDelta * Math.cos(angle), latitude + latDelta * Math.sin(angle)]);
  }
  // Close the ring.
  coords.push(coords[0]);
  return coords;
}

export default function ProjectsMapPage(): JSX.Element {
  const protectionZones = useMemo(
    () =>
      mockCarbonProjects.map((project) => ({
        projectId: project.id,
        projectName: project.name,
        areaHectares: PROTECTION_BUFFER_AREA_HA,
        radiusKm: PROTECTION_BUFFER_RADIUS_KM,
        polygon: buildBufferPolygon(
          project.latitude,
          project.longitude,
          PROTECTION_BUFFER_RADIUS_KM
        ),
        // Placeholder: replace with real deforestation event intersection check.
        hasDeforestationAlert: false,
      })),
    []
  );

  const alertCount = protectionZones.filter((zone) => zone.hasDeforestationAlert).length;

  return (
    <main className="min-h-screen bg-background text-foreground py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/projects"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              &larr; Back to Project Catalog
            </Link>
            <span className="text-muted-foreground">•</span>
            <Badge
              variant="outline"
              className="bg-primary/5 text-primary border-primary/20 text-xs"
            >
              Geographic Visualization v2
            </Badge>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Global Offset Projects Map
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Explore verified carbon offset initiatives across continents. Filter by geographic
            region, project typology, and credit availability with real-time hover telemetrics and
            on-chain verified issuance.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="bg-emerald-500/5 text-emerald-600 border-emerald-500/20 text-xs"
            >
              Forest Protection Zones: {PROTECTION_BUFFER_RADIUS_KM} km buffer &middot;{' '}
              {PROTECTION_BUFFER_AREA_HA.toLocaleString()} ha each
            </Badge>
            {alertCount > 0 ? (
              <Badge
                variant="outline"
                className="bg-destructive/5 text-destructive border-destructive/20 text-xs"
              >
                ⚠ Deforestation detected in {alertCount} buffer zone{alertCount === 1 ? '' : 's'}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-muted/40 text-muted-foreground border-border text-xs"
              >
                No deforestation alerts in buffer zones
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/projects">
            <Button variant="outline" size="sm" className="cursor-pointer">
              Grid View
            </Button>
          </Link>
          <Link href="/marketplace">
            <Button size="sm" className="cursor-pointer">
              Marketplace &rarr;
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Interactive Map Component */}
      <Suspense
        fallback={
          <div className="w-full h-[620px] rounded-2xl bg-muted/40 animate-pulse border border-border" />
        }
      >
        <OffsetProjectMapWrapper
          projects={mockCarbonProjects}
          protectionZones={protectionZones}
          height="660px"
          showFilters={true}
        />
      </Suspense>
    </main>
  );
}
