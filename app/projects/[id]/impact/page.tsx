import type { JSX } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ImpactAnalyticsDashboard } from '@/components/organisms/AnalyticsDashboard/ImpactAnalyticsDashboard';
import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';

interface Props {
  params: Promise<{ id: string }>;
}

function resolveProject(id: string): { id: string; name: string } | undefined {
  const adminProject = mockAdminProjectDetails.find(
    (project) => project.id === id || project.slug === id
  );
  const carbonProject = mockCarbonProjects.find(
    (project) => project.id === (adminProject?.id ?? id)
  );

  const projectId = adminProject?.id ?? carbonProject?.id;
  const projectName = adminProject?.name ?? carbonProject?.name;

  if (!projectId || !projectName) {
    return undefined;
  }

  return { id: projectId, name: projectName };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const project = resolveProject(id);

  if (!project) {
    return { title: 'Project Not Found | FarmCredit' };
  }

  return {
    title: `${project.name} Impact | FarmCredit`,
    description: `Real-time environmental and community impact for ${project.name}.`,
  };
}

export default async function ProjectImpactPage({ params }: Props): Promise<JSX.Element> {
  const { id } = await params;
  const project = resolveProject(id);

  if (!project) {
    notFound();
  }

  return <ImpactAnalyticsDashboard projectId={project.id} projectName={project.name} />;
}
