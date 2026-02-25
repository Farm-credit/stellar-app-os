export type AdminProjectStatus = "active" | "pending" | "archived";

export interface AdminProject {
  id: string;
  name: string;
  status: AdminProjectStatus;
  createdAt: string;
}

export interface DashboardMetrics {
  totalProjects: number;
  activeProjects: number;
  pendingProjects: number;
  archivedProjects: number;
  totalDonationsProcessed: number;
  totalCreditsMinted: number;
  totalCreditsRetired: number;
}

export interface DashboardTrendPoint {
  label: string;
  donations: number;
  credits: number;
}

export type ActivityType = "project" | "donation" | "mint" | "retire";

export interface DashboardActivity {
  id: string;
  type: ActivityType;
  title: string;
  detail: string;
  timestamp: string;
}

export interface AdminDashboardData {
  metrics: DashboardMetrics;
  trends: DashboardTrendPoint[];
  recentActivity: DashboardActivity[];
}
