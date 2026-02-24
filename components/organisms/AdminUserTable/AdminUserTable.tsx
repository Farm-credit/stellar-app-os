'use client';

import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { UserTableRow } from '@/components/molecules/UserTableRow/UserTableRow';
import { UserTableFilterBar } from '@/components/molecules/UserTableFilterBar/UserTableFilterBar';
import { UserDetailModal } from '@/components/molecules/UserDetailModal/UserDetailModal';
import { UserActionModal } from '@/components/molecules/UserActionModal/UserActionModal';
import type { AdminUser, UserTableFilterState, UserActionModalState } from '@/lib/types/adminUser';
import { filterUsers } from '@/lib/admin/userFilters';

interface AdminUserTableProps {
  users: AdminUser[];
  onUserAction?: (userId: string, action: 'suspend' | 'unsuspend' | 'delete', reason?: string) => Promise<void>;
}

const DEFAULT_FILTERS: UserTableFilterState = {
  search: '',
  status: 'all',
  sortBy: 'lastActiveAt',
  sortOrder: 'desc',
};

const DEFAULT_MODAL: UserActionModalState = {
  isOpen: false,
  action: null,
  userId: null,
  reason: '',
};

const ACTION_CONFIG = {
  suspend: {
    title: 'Suspend User',
    description: 'This user will be suspended and cannot access the platform.',
    action: 'Suspend',
    variant: 'warning' as const,
    includeReason: true,
  },
  unsuspend: {
    title: 'Unsuspend User',
    description: 'This user will regain full access to the platform.',
    action: 'Unsuspend',
    variant: 'info' as const,
    includeReason: false,
  },
  delete: {
    title: 'Delete User',
    description: 'This will permanently delete the user account. This action cannot be undone.',
    action: 'Delete',
    variant: 'destructive' as const,
    includeReason: true,
  },
};

export function AdminUserTable({ users, onUserAction }: AdminUserTableProps): ReactNode {
  const [filters, setFilters] = useState<UserTableFilterState>(DEFAULT_FILTERS);
  const [actionModal, setActionModal] = useState<UserActionModalState>(DEFAULT_MODAL);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const filteredUsers = useMemo(() => filterUsers(users, filters), [users, filters]);

  const detailUser = useMemo(
    () => users.find((u) => u.id === detailUserId) ?? null,
    [users, detailUserId]
  );

  const handleFilterChange = useCallback((partial: Partial<UserTableFilterState>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  }, []);

  const openAction = useCallback(
    (userId: string, action: 'suspend' | 'unsuspend' | 'delete') => {
      setActionModal({ isOpen: true, action, userId, reason: '' });
    },
    []
  );

  const handleConfirm = useCallback(async () => {
    if (!actionModal.action || !actionModal.userId) return;
    try {
      setIsLoading(true);
      await onUserAction?.(actionModal.userId, actionModal.action, actionModal.reason);
      await new Promise((resolve) => setTimeout(resolve, 400));
      setActionModal(DEFAULT_MODAL);
    } catch (err) {
      console.error('User action failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [actionModal, onUserAction]);

  const handleCancel = useCallback(() => {
    setActionModal(DEFAULT_MODAL);
  }, []);

  const modalConfig = actionModal.action ? ACTION_CONFIG[actionModal.action] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Text as="h1" variant="h2" className="mb-1">
          User Management
        </Text>
        <Text variant="muted">
          View, suspend, and manage platform users. Sensitive data is masked for privacy
          compliance.
        </Text>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Users</CardTitle>
          <CardDescription>
            {users.length} total {users.length === 1 ? 'user' : 'users'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filters */}
          <UserTableFilterBar
            filters={filters}
            onFilterChange={handleFilterChange}
            resultCount={filteredUsers.length}
            totalCount={users.length}
          />

          {/* Table */}
          {filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-12">
              <Text variant="muted" className="text-center">
                No users found matching your filters.
              </Text>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="mt-2 text-xs"
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="User management table">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Wallet
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">
                      Donations
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider">
                      Credits
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Last Active
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <UserTableRow
                      key={user.id}
                      user={user}
                      onViewDetails={setDetailUserId}
                      onSuspend={(id) => openAction(id, 'suspend')}
                      onUnsuspend={(id) => openAction(id, 'unsuspend')}
                      onDelete={(id) => openAction(id, 'delete')}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Detail Modal */}
      {detailUser && (
        <UserDetailModal user={detailUser} onClose={() => setDetailUserId(null)} />
      )}

      {/* Action Confirmation Modal */}
      {modalConfig && (
        <UserActionModal
          isOpen={actionModal.isOpen}
          title={modalConfig.title}
          description={modalConfig.description}
          action={modalConfig.action}
          variant={modalConfig.variant}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isLoading={isLoading}
          reasonField={
            modalConfig.includeReason
              ? {
                  label: 'Reason (optional)',
                  value: actionModal.reason,
                  onChange: (reason) => setActionModal((prev) => ({ ...prev, reason })),
                  placeholder: 'Explain why you are taking this action...',
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
