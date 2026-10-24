import * as React from 'react';
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';

import { ProjectDetailView } from '@/components/organisms/ProjectDetailView/ProjectDetailView';
import { ForestRegenerationSimulation } from '@/components/organisms/ForestRegenerationSimulation/ForestRegenerationSimulation';
import { ForestProtectionZone } from '@/components/organisms/ForestProtectionZone/ForestProtectionZone';
import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { getMockProjectCoverage } from '@/lib/api/mock/projectCoverage';
import { ensureDeforestationAlertsSeeded, getProjectAlerts } from '@/lib/deforestation/service';
import { getProjectSurvivalStatistic } from '@/lib/census/survival';
import { SurvivalRateStat } from '@/components/molecules/SurvivalRateStat';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { id } = await params;
  const adminProject = mockAdminProjectDetails.find((p) => p.id === id || p.slug === id);
  const carbonProject = mockCarbonProjects.find((p) => p.id === id);
  const project = adminProject ?? carbonProject;

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

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const carbonProject = mockCarbonProjects.find((p) => p.id === id);
  if (!carbonProject) {
    notFound();
  }

  const bufferZone = adminProject.bufferZone;
  const protectionZoneAreaHa = bufferZone?.areaHectares;

  // Live satellite alerts for this project's monitored zone (issue #672).
  await ensureDeforestationAlertsSeeded();
  const deforestationAlerts = getProjectAlerts(adminProject.id);
  const latestAlert = deforestationAlerts[0];
  const hasDeforestationAlert =
    Boolean(bufferZone?.deforestationAlert) || deforestationAlerts.length > 0;

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
