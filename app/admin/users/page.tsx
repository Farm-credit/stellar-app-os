'use client';

import type { ReactNode } from 'react';
import { AdminUserTable } from '@/components/organisms/AdminUserTable/AdminUserTable';
import { mockAdminUsers } from '@/lib/api/mock/adminUsers';

export default function AdminUsersPage(): ReactNode {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:py-10">
      <AdminUserTable
        users={mockAdminUsers}
        onUserAction={async (userId, action, reason) => {
          // TODO: Replace with real API call
          console.log('User action:', { userId, action, reason });
        }}
      />
    </div>
  );
}
