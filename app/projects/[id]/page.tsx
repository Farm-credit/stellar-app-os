import * as React from 'react';
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';

import { ProjectDetailView } from '@/components/organisms/ProjectDetailView/ProjectDetailView';
import { ForestRegenerationSimulation } from '@/components/organisms/ForestRegenerationSimulation/ForestRegenerationSimulation';
import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';

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
  const hasDeforestationAlert = Boolean(bufferZone?.deforestationAlert);

  return (
    <>
      {hasDeforestationAlert && (
        <div
          role="alert"
          className="mx-auto mt-4 max-w-7xl rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <strong className="font-semibold">Deforestation alert:</strong>{' '}
          Deforestation has been detected inside this project&apos;s forest protection buffer zone.
        </div>
      )}

      {typeof protectionZoneAreaHa === 'number' && (
        <div className="mx-auto mt-4 max-w-7xl rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <strong className="font-semibold">Protection zone area:</strong>{' '}
          {protectionZoneAreaHa.toLocaleString()} hectares
        </div>
      )}

      <ProjectDetailView adminProject={adminProject} carbonProject={carbonProject} />

      <ForestRegenerationSimulation
        species={adminProject.primarySpecies}
        climateZone={adminProject.climateZone}
      />
    </>
  );
}
