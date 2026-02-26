import type { ReactNode } from 'react';
import { AdminProjectTable } from '@/components/organisms/AdminProjectTable/AdminProjectTable';
import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';

export default function AdminProjectsPage(): ReactNode {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:py-10">
      <AdminProjectTable
        projects={mockAdminProjectDetails}
        onProjectUpdate={(payload) => {
          console.info('Project update:', payload);
          // TODO: Implement API call to update projects
          return Promise.resolve();
        }}
        onNavigateDetail={(projectId) => {
          console.info('Navigate to detail view:', projectId);
          // TODO: Implement navigation to detail page
        }}
      />
    </div>
  );
}
