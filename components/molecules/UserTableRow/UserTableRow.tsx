'use client';

import { type ReactNode } from 'react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import type { AdminUser, AdminUserStatus } from '@/lib/types/adminUser';
import {
  maskEmail,
  maskWallet,
  formatUserDate,
  formatDonations,
} from '@/lib/admin/userFilters';

const statusStyles: Record<AdminUserStatus, string> = {
  Active: 'bg-stellar-green/10 text-stellar-green border border-stellar-green/30',
  Suspended: 'bg-stellar-purple/10 text-stellar-purple border border-stellar-purple/30',
  Deleted: 'bg-destructive/10 text-destructive border border-destructive/30',
};

interface UserTableRowProps {
  user: AdminUser;
  onViewDetails: (userId: string) => void;
  onSuspend: (userId: string) => void;
  onUnsuspend: (userId: string) => void;
  onDelete: (userId: string) => void;
}

export function UserTableRow({
  user,
  onViewDetails,
  onSuspend,
  onUnsuspend,
  onDelete,
}: UserTableRowProps): ReactNode {
  return (
    <tr className="border-b border-border transition-colors hover:bg-muted/50">
      {/* ID */}
      <td className="px-4 py-3">
        <Text variant="small" className="font-mono text-xs">
          {user.id}
        </Text>
      </td>

      {/* Email */}
      <td className="max-w-[200px] px-4 py-3">
        <Text variant="small" className="truncate" title="Email masked for privacy">
          {maskEmail(user.email)}
        </Text>
      </td>

      {/* Wallet */}
      <td className="px-4 py-3">
        <Text
          variant="small"
          className="font-mono text-xs"
          title="Wallet address masked for privacy"
        >
          {maskWallet(user.walletAddress)}
        </Text>
      </td>

      {/* Donations */}
      <td className="px-4 py-3 text-right">
        <Text variant="small" className="font-semibold">
          {formatDonations(user.totalDonations)}
        </Text>
      </td>

      {/* Credits */}
      <td className="px-4 py-3 text-right">
        <Text variant="small" className="font-semibold">
          {user.totalCredits.toLocaleString()}
        </Text>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[user.status]}`}
        >
          {user.status}
        </span>
      </td>

      {/* Last Active */}
      <td className="px-4 py-3">
        <Text variant="small">{formatUserDate(user.lastActiveAt)}</Text>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          <Button
            onClick={() => onViewDetails(user.id)}
            stellar="primary"
            size="sm"
            className="text-xs"
            aria-label={`View details for user ${user.id}`}
          >
            View
          </Button>

          {user.status === 'Active' && (
            <Button
              onClick={() => onSuspend(user.id)}
              stellar="accent"
              size="sm"
              className="text-xs"
              aria-label={`Suspend user ${user.id}`}
            >
              Suspend
            </Button>
          )}

          {user.status === 'Suspended' && (
            <Button
              onClick={() => onUnsuspend(user.id)}
              stellar="success"
              size="sm"
              className="text-xs"
              aria-label={`Unsuspend user ${user.id}`}
            >
              Unsuspend
            </Button>
          )}

          {user.status !== 'Deleted' && (
            <Button
              onClick={() => onDelete(user.id)}
              variant="outline"
              size="sm"
              className="text-xs text-destructive hover:text-destructive"
              aria-label={`Delete user ${user.id}`}
            >
              Delete
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
