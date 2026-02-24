import type { AdminUser, AdminUserStatus, UserTableFilterState } from '@/lib/types/adminUser';

export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return email;
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***${domain}`;
}

export function maskWallet(wallet: string): string {
  if (wallet.length <= 8) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

export function formatUserDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatUserDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDonations(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function filterUsers(
  users: AdminUser[],
  filters: UserTableFilterState
): AdminUser[] {
  let filtered = [...users];

  if (filters.search.trim()) {
    const query = filters.search.toLowerCase().trim();
    filtered = filtered.filter(
      (user) =>
        user.email.toLowerCase().includes(query) ||
        user.walletAddress.toLowerCase().includes(query) ||
        user.id.toLowerCase().includes(query)
    );
  }

  if (filters.status !== 'all') {
    filtered = filtered.filter((user) => user.status === filters.status);
  }

  filtered.sort((a, b) => {
    let comparison = 0;

    switch (filters.sortBy) {
      case 'email':
        comparison = a.email.localeCompare(b.email);
        break;
      case 'joinedAt':
        comparison = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
        break;
      case 'lastActiveAt':
        comparison =
          new Date(a.lastActiveAt).getTime() - new Date(b.lastActiveAt).getTime();
        break;
      case 'donations':
        comparison = a.totalDonations - b.totalDonations;
        break;
      case 'credits':
        comparison = a.totalCredits - b.totalCredits;
        break;
    }

    return filters.sortOrder === 'asc' ? comparison : -comparison;
  });

  return filtered;
}

export function getUserStatusColor(status: AdminUserStatus): string {
  switch (status) {
    case 'Active':
      return 'success';
    case 'Suspended':
      return 'accent';
    case 'Deleted':
      return 'destructive';
    default:
      return 'secondary';
  }
}
