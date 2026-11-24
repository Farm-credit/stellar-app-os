import * as React from 'react';
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';

import { ProjectDetailView } from '@/components/organisms/ProjectDetailView/ProjectDetailView';
import { ForestRegenerationSimulation } from '@/components/organisms/ForestRegenerationSimulation/ForestRegenerationSimulation';
import { ForestProtectionZone } from '@/components/organisms/ForestProtectionZone/ForestProtectionZone';
import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { getMockProjectCoverage } from '@/lib/api/mock/projectCoverage';
import {
  ensureDeforestationAlertsSeeded,
  getProjectAlerts,
  isAlertInsideBufferZone,
} from '@/lib/deforestation/service';
import { getProjectSurvivalStatistic } from '@/lib/census/survival';
import { SurvivalRateStat } from '@/components/molecules/SurvivalRateStat';
import { FireRiskIndicator } from '@/components/molecules/FireRiskIndicator';
import { getProjectFireRisk } from '@/lib/fire-risk';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { id } = await params;
  const project = mockAdminProjectDetails.find((p) => p.id === id || p.slug === id);

  if (!project) {
    return {
      title: 'Project Not Found | FarmCredit',
    };
  }

  const previousImages = (await parent).openGraph?.images || [];

  return {
    title: `${project.name} | FarmCredit`,
    description: project.description,
    openGraph: {
      title: project.name,
      description: project.description,
      images: [
        'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=1200',
        ...previousImages,
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: project.name,
      description: project.description,
      images: [
        'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=1200',
      ],
    },
  };
}

/**
 * Approximate geodesic area (in hectares) of a polygon given as [lat, lng] pairs.
 * Uses the spherical excess formula; falls back to 0 for degenerate polygons.
 */
function computePolygonAreaHectares(
  polygon: ReadonlyArray<readonly [number, number]> | undefined
): number | undefined {
  if (!polygon || polygon.length < 3) {
    return undefined;
  }

  const EARTH_RADIUS_M = 6_378_137;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  let total = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const [lat1, lng1] = polygon[i];
    const [lat2, lng2] = polygon[(i + 1) % polygon.length];
    total += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }

  const areaM2 = Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
  return Math.round((areaM2 / 10_000) * 100) / 100;
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const adminProject = mockAdminProjectDetails.find((p) => p.id === id || p.slug === id);

  if (!adminProject) {
    notFound();
  }

  const carbonProject = mockCarbonProjects.find((p) => p.id === adminProject.id);

  if (!carbonProject) {
    notFound();
  }

  const bufferZone = adminProject.bufferZone;
  const protectionZoneAreaHa =
    typeof bufferZone?.areaHectares === 'number'
      ? bufferZone.areaHectares
      : computePolygonAreaHectares(bufferZone?.polygon);

  // Live satellite alerts for this project's monitored zone (issue #672).
  await ensureDeforestationAlertsSeeded();
  const deforestationAlerts = getProjectAlerts(adminProject.id);
  const bufferZoneAlerts = bufferZone
    ? deforestationAlerts.filter((alert) => isAlertInsideBufferZone(alert, bufferZone))
    : deforestationAlerts;
  const latestAlert = bufferZoneAlerts[0];
  const hasDeforestationAlert =
    Boolean(bufferZone?.deforestationAlert) || bufferZoneAlerts.length > 0;

  return (
    <>
      {hasDeforestationAlert && (
        <div
          role="alert"
          className="mx-auto mt-4 max-w-7xl rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <strong className="font-semibold">Deforestation alert:</strong>{' '}
          {latestAlert ? (
            <>
              Canopy loss of{' '}
              {latestAlert.areaHectares > 0
                ? `${latestAlert.areaHectares.toLocaleString()} ha `
                : ''}
              detected on {latestAlert.detectedOn} inside this project&apos;s forest protection
              buffer zone (confidence: {latestAlert.confidence}). The affected area is highlighted
              on the map below.
            </>
          ) : (
            <>
              Deforestation has been detected inside this project&apos;s forest protection buffer
              zone.
            </>
          )}
        </div>
      )}

      {typeof protectionZoneAreaHa === 'number' && (
        <div className="mx-auto mt-4 max-w-7xl rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <strong className="font-semibold">Protection zone area:</strong>{' '}
          {protectionZoneAreaHa.toLocaleString()} hectares
        </div>
      )}

      <ProjectDetailView
        adminProject={adminProject}
        carbonProject={carbonProject}
        coverage={getMockProjectCoverage(adminProject.id)}
      />

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <FireRiskIndicator {...getProjectFireRisk(adminProject.id)} />
        {/* Survival rate per project (issue #1645) */}
        <SurvivalRateStat
          initial={getProjectSurvivalStatistic(adminProject.id)}
          refreshQuery={{ projectId: adminProject.id }}
        />

        <ForestRegenerationSimulation
          species={adminProject.primarySpecies ?? 'Mixed Native Species'}
          climateZone={adminProject.climateZone ?? 'Tropical'}
        />

        {bufferZone && (
          <ForestProtectionZone bufferZone={bufferZone} alerts={deforestationAlerts} />
        )}
      </div>
    </>
  );
}
