export type AdminUserStatus = 'Active' | 'Suspended' | 'Deleted';

export type AdminUserActivityType =
  | 'donation'
  | 'credit_purchase'
  | 'listing_created'
  | 'listing_sold'
  | 'wallet_connected'
  | 'profile_updated';

export type AdminUserAuditAction = 'suspended' | 'unsuspended' | 'deleted' | 'viewed';

export interface AdminUserActivityEntry {
  id: string;
  timestamp: string;
  type: AdminUserActivityType;
  description: string;
  amount?: number;
  currency?: string;
}

export interface AdminUserAuditEntry {
  id: string;
  timestamp: string;
  action: AdminUserAuditAction;
  performedBy: string;
  reason?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  walletAddress: string;
  totalDonations: number;
  totalCredits: number;
  status: AdminUserStatus;
  joinedAt: string;
  lastActiveAt: string;
  activityLog: AdminUserActivityEntry[];
  auditLog: AdminUserAuditEntry[];
}

export interface UserTableFilterState {
  search: string;
  status: AdminUserStatus | 'all';
  sortBy: 'email' | 'joinedAt' | 'lastActiveAt' | 'donations' | 'credits';
  sortOrder: 'asc' | 'desc';
}

export interface UserActionModalState {
  isOpen: boolean;
  action: 'suspend' | 'unsuspend' | 'delete' | null;
  userId: string | null;
  reason: string;
}
