import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminProjectDetailView } from '@/components/organisms/AdminProjectDetail/AdminProjectDetailView';
import { getMockAdminProjectDetailById } from '@/lib/api/mock/adminProjectDetails';
import { getMockOffsetProjects } from '@/lib/api/mock/offsetProjects';

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

  const minPrice = filters?.minPrice ? Number(filters.minPrice) : undefined;
  const maxPrice = filters?.maxPrice ? Number(filters.maxPrice) : undefined;

  const filteredProjects = getMockOffsetProjects().filter((offsetProject) => {
    if (filters?.projectType && offsetProject.projectType !== filters.projectType) {
      return false;
    }

    if (filters?.location && offsetProject.location !== filters.location) {
      return false;
    }

    if (filters?.certificationStandard && offsetProject.certificationStandard !== filters.certificationStandard) {
      return false;
    }

    if (coBenefits && coBenefits.length > 0) {
      const projectBenefits = offsetProject.coBenefits ?? [];
      const hasAllCoBenefits = coBenefits.every((benefit) => projectBenefits.includes(benefit));

      if (!hasAllCoBenefits) {
        return false;
      }
    }

    if (minPrice !== undefined && offsetProject.price < minPrice) {
      return false;
    }

    if (maxPrice !== undefined && offsetProject.price > maxPrice) {
      return false;
    }

    return true;
  });

  return (
    <AdminProjectDetailView
      initialProject={project}
      initialProjects={filteredProjects}
      initialFilters={{
        projectType: filters?.projectType,
        location: filters?.location,
        coBenefits,
        certificationStandard: filters?.certificationStandard,
        minPrice,
        maxPrice,
      }}
    />
  );
}
