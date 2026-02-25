import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminProjectDetailView } from '@/components/organisms/AdminProjectDetail/AdminProjectDetailView';
import { getMockAdminProjectDetailById } from '@/lib/api/mock/adminProjectDetails';

interface AdminProjectDetailPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default async function AdminProjectDetailPage({
  params,
}: AdminProjectDetailPageProps): Promise<ReactNode> {
  const { projectId } = await params;
  const project = getMockAdminProjectDetailById(projectId);

  if (!project) {
    notFound();
    return null;
  }

  return <AdminProjectDetailView initialProject={project} />;
}
