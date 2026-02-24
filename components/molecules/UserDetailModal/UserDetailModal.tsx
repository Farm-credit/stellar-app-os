'use client';

import { type ReactNode } from 'react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import type { AdminUser, AdminUserStatus } from '@/lib/types/adminUser';
import {
  maskEmail,
  maskWallet,
  formatUserDate,
  formatUserDateTime,
  formatDonations,
} from '@/lib/admin/userFilters';

const statusStyles: Record<AdminUserStatus, string> = {
  Active: 'bg-stellar-green/10 text-stellar-green border border-stellar-green/30',
  Suspended: 'bg-stellar-purple/10 text-stellar-purple border border-stellar-purple/30',
  Deleted: 'bg-destructive/10 text-destructive border border-destructive/30',
};

const activityTypeLabels: Record<string, string> = {
  donation: 'Donation',
  credit_purchase: 'Credit Purchase',
  listing_created: 'Listing Created',
  listing_sold: 'Listing Sold',
  wallet_connected: 'Wallet Connected',
  profile_updated: 'Profile Updated',
};

const auditActionLabels: Record<string, string> = {
  suspended: 'Suspended',
  unsuspended: 'Unsuspended',
  deleted: 'Deleted',
  viewed: 'Viewed',
};

const auditActionStyles: Record<string, string> = {
  suspended: 'text-stellar-purple',
  unsuspended: 'text-stellar-green',
  deleted: 'text-destructive',
  viewed: 'text-muted-foreground',
};

interface UserDetailModalProps {
  user: AdminUser;
  onClose: () => void;
}

export function UserDetailModal({ user, onClose }: UserDetailModalProps): ReactNode {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-detail-title"
    >
      <Card className="w-full max-w-2xl">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle id="user-detail-title" className="text-lg">
              User Details
            </CardTitle>
            <Text variant="muted" className="font-mono text-xs">
              {user.id}
            </Text>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close user detail modal"
            className="shrink-0"
          >
            ✕
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* User Info Grid */}
          <div>
            <Text as="h3" variant="h4" className="mb-3 text-base">
              Account Information
            </Text>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="mb-0.5 text-xs font-medium text-muted-foreground">Email</dt>
                <dd className="text-sm font-medium" title="Email masked for privacy">
                  {maskEmail(user.email)}
                </dd>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="mb-0.5 text-xs font-medium text-muted-foreground">
                  Wallet Address
                </dt>
                <dd
                  className="font-mono text-xs font-medium"
                  title="Wallet address masked for privacy"
                >
                  {maskWallet(user.walletAddress)}
                </dd>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="mb-0.5 text-xs font-medium text-muted-foreground">Status</dt>
                <dd>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[user.status]}`}
                  >
                    {user.status}
                  </span>
                </dd>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="mb-0.5 text-xs font-medium text-muted-foreground">
                  Member Since
                </dt>
                <dd className="text-sm font-medium">{formatUserDate(user.joinedAt)}</dd>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="mb-0.5 text-xs font-medium text-muted-foreground">
                  Total Donations
                </dt>
                <dd className="text-sm font-semibold text-stellar-green">
                  {formatDonations(user.totalDonations)}
                </dd>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="mb-0.5 text-xs font-medium text-muted-foreground">
                  Total Credits
                </dt>
                <dd className="text-sm font-semibold text-stellar-blue">
                  {user.totalCredits.toLocaleString()} credits
                </dd>
              </div>
              <div className="col-span-1 rounded-lg bg-muted/50 p-3 sm:col-span-2">
                <dt className="mb-0.5 text-xs font-medium text-muted-foreground">
                  Last Active
                </dt>
                <dd className="text-sm font-medium">
                  {formatUserDateTime(user.lastActiveAt)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Activity Log */}
          <div>
            <Text as="h3" variant="h4" className="mb-3 text-base">
              Activity Log
            </Text>
            {user.activityLog.length === 0 ? (
              <Text variant="muted" className="text-sm">
                No activity recorded.
              </Text>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm" aria-label="User activity log">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left text-xs font-medium">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">Type</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.activityLog.map((entry) => (
                      <tr key={entry.id} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                          {formatUserDateTime(entry.timestamp)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center rounded-full bg-stellar-blue/10 px-2 py-0.5 text-xs font-medium text-stellar-blue">
                            {activityTypeLabels[entry.type] ?? entry.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{entry.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Audit Log */}
          <div>
            <Text as="h3" variant="h4" className="mb-3 text-base">
              Admin Audit Log
            </Text>
            {user.auditLog.length === 0 ? (
              <Text variant="muted" className="text-sm">
                No admin actions recorded.
              </Text>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm" aria-label="Admin audit log">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left text-xs font-medium">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">Action</th>
                      <th className="px-3 py-2 text-left text-xs font-medium">
                        Performed By
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.auditLog.map((entry) => (
                      <tr key={entry.id} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                          {formatUserDateTime(entry.timestamp)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-xs font-semibold ${auditActionStyles[entry.action] ?? 'text-foreground'}`}
                          >
                            {auditActionLabels[entry.action] ?? entry.action}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{entry.performedBy}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {entry.reason ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Close */}
          <div className="flex justify-end">
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
