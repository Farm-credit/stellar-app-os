import type {
  AdminProjectDetail,
  AdminProjectLifecycleStatus,
  AdminProjectType,
  AdminRiskRating,
} from '@/lib/types/adminProject';
import type { TableFilterState } from '@/lib/types/admin';

export function filterProjects(
  projects: AdminProjectDetail[],
  filters: TableFilterState
): AdminProjectDetail[] {
  let filtered = projects;

  // Search filter
  if (filters.search.trim()) {
    const query = filters.search.toLowerCase();
    filtered = filtered.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.id.toLowerCase().includes(query) ||
        project.location.toLowerCase().includes(query) ||
        project.country.toLowerCase().includes(query)
    );
  }

  // Lifecycle status filter
  if (filters.lifecycleStatus !== 'all') {
    filtered = filtered.filter((project) => project.lifecycleStatus === filters.lifecycleStatus);
  }

  // Project type filter
  if (filters.projectType !== 'all') {
    filtered = filtered.filter((project) => project.type === filters.projectType);
  }

  // Risk rating filter
  if (filters.riskRating !== 'all') {
    filtered = filtered.filter((project) => project.riskRating === filters.riskRating);
  }

  // Sorting
  filtered.sort((a, b) => {
    let comparison = 0;

    switch (filters.sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'lifecycleStatus':
        comparison = a.lifecycleStatus.localeCompare(b.lifecycleStatus);
        break;
      case 'credits':
        comparison = a.availableSupplyTons - b.availableSupplyTons;
        break;
      case 'createdAt':
        comparison = new Date(a.lastUpdatedAt).getTime() - new Date(b.lastUpdatedAt).getTime();
        break;
    }

    return filters.sortOrder === 'asc' ? comparison : -comparison;
  });

  return filtered;
}

export function getProjectTypes(projects: AdminProjectDetail[]): AdminProjectType[] {
  return Array.from(new Set(projects.map((p) => p.type))) as AdminProjectType[];
}

export function getRiskRatings(projects: AdminProjectDetail[]): AdminRiskRating[] {
  return Array.from(new Set(projects.map((p) => p.riskRating))) as AdminRiskRating[];
}

export function getStatusColor(status: AdminProjectLifecycleStatus): string {
  switch (status) {
    case 'Draft':
      return 'secondary';
    case 'Under Review':
      return 'accent';
    case 'Approved':
      return 'success';
    case 'Paused':
      return 'outline';
    case 'Archived':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export function getRiskColor(risk: AdminRiskRating): string {
  switch (risk) {
    case 'Low':
      return 'success';
    case 'Medium':
      return 'accent';
    case 'High':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatCredits(credits: number): string {
  return credits.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatPrice(price: number): string {
  return price.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function getNextLifecycleStatus(
  current: AdminProjectLifecycleStatus
): AdminProjectLifecycleStatus | null {
  const statusFlow: Record<AdminProjectLifecycleStatus, AdminProjectLifecycleStatus | null> = {
    Draft: 'Under Review',
    'Under Review': 'Approved',
    Approved: 'Paused',
    Paused: 'Approved',
    Archived: null,
  };

  return statusFlow[current] || null;
}

export function canApproveProject(status: AdminProjectLifecycleStatus): boolean {
  return status === 'Under Review' || status === 'Paused';
}

export function canPauseProject(status: AdminProjectLifecycleStatus): boolean {
  return status === 'Approved';
}

export function canArchiveProject(status: AdminProjectLifecycleStatus): boolean {
  return status !== 'Archived';
}
