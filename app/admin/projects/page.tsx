'use client';

import type { ReactNode } from 'react';
import { Text } from '@/components/atoms/Text';
import { AdminProjectTable } from '@/components/organisms/AdminProjectTable/AdminProjectTable';
import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';

export default function AdminProjectsPage(): ReactNode {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:py-10">
      <div className="mb-8">
        <Text as="h1" variant="h2" className="mb-2">
          Admin Projects
        </Text>
        <Text as="p" variant="muted">
          Open a project to manage editable fields, MRV documents, verification, issuance history,
          and activity logs.
        </Text>
      </div>

      <AdminProjectTable
        projects={mockAdminProjectDetails}
        onProjectUpdate={async (payload) => {
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
