'use@client';

import type { ReactNode } from 'react';
import { AdminUserTable } from '@/components/organisms/AdminUserTable/AdminUserTable';
import { mockAdminUsers } from '@/lib/api/mock/adminUsers';

export default function AdminUsersPage(): ReactNode {
  const handleUserAction = (userId: string, action: string, reason?: string) => {
    if (action === 'export') {
      return fetch(`/api/admin/users/${userId}/export`, { method: 'POST' });
    }
    if (action === 'delete') {
      return fetch(`/api/admin/users/${userId}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
    }
    return Promise.resolve();
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:py-10">
      <AdminUserTable users={mockAdminUsers} onUserAction={handleUserAction} />
    </div>
  );
}
