import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminProjectDetailView } from '@/components/organisms/AdminProjectDetail/AdminProjectDetailView';
import { getMockAdminProjectDetailById } from '@/lib/api/mock/adminProjectDetails';

interface AdminProjectDetailSearchParams {
  projectType?: string;
  location?: string;
  coBenefits?: string;
  certificationStandard?: string;
  minPrice?: string;
  maxPrice?: string;
}

interface AdminProjectDetailPageProps {
  params: Promise<{
    projectId: string;
  }>;
  searchParams?: Promise<AdminProjectDetailSearchParams>;
}

export default async function AdminProjectDetailPage({
  params,
  searchParams,
}: AdminProjectDetailPageProps): Promise<ReactNode> {
  const { projectId } = await params;
  const filters = searchParams ? await searchParams : undefined;
  const project = getMockAdminProjectDetailById(projectId);

  if (!project) {
    notFound();
    return null;
  }

  const coBenefits = filters?.coBenefits
    ? filters.coBenefits.split(',').map((benefit) => benefit.trim()).filter(Boolean)
    : undefined;

  return (
    <AdminProjectDetailView
      initialProject={project}
      initialFilters={{
        projectType: filters?.projectType,
        location: filters?.location,
        coBenefits,
        certificationStandard: filters?.certificationStandard,
        minPrice: filters?.minPrice ? Number(filters.minPrice) : undefined,
        maxPrice: filters?.maxPrice ? Number(filters.maxPrice) : undefined,
      }}
    />
  );
}
