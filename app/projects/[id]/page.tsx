import * as React from 'react';
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';

import { ProjectDetailView } from '@/components/organisms/ProjectDetailView/ProjectDetailView';
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

  return <ProjectDetailView adminProject={adminProject} carbonProject={carbonProject} />;
}
