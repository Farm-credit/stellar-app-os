import type {
  AdminDashboardData,
  AdminProject,
  DashboardActivity,
  DashboardTrendPoint,
} from "@/lib/types/adminDashboard";

const mockProjects: AdminProject[] = [
  { id: "p-001", name: "Niger Delta Wetland Recovery", status: "active", createdAt: "2025-02-11T10:15:00Z" },
  { id: "p-002", name: "Sahel Agroforestry Expansion", status: "active", createdAt: "2025-05-23T09:20:00Z" },
  { id: "p-003", name: "Irrigation Efficiency Program", status: "pending", createdAt: "2025-08-30T14:10:00Z" },
  { id: "p-004", name: "Organic Soil Carbon Trial", status: "archived", createdAt: "2024-07-18T08:05:00Z" },
  { id: "p-005", name: "Rural Solar Drying Units", status: "active", createdAt: "2025-10-01T11:45:00Z" },
  { id: "p-006", name: "Regenerative Cotton Initiative", status: "pending", createdAt: "2026-01-14T16:55:00Z" },
  { id: "p-007", name: "Drip Optimization Pilot", status: "archived", createdAt: "2024-11-04T12:00:00Z" },
];

const mockTrendPoints: DashboardTrendPoint[] = [
  { label: "Mar", donations: 21500, credits: 980 },
  { label: "Apr", donations: 26800, credits: 1120 },
  { label: "May", donations: 24100, credits: 1095 },
  { label: "Jun", donations: 29500, credits: 1300 },
  { label: "Jul", donations: 33200, credits: 1490 },
  { label: "Aug", donations: 35800, credits: 1610 },
  { label: "Sep", donations: 34650, credits: 1575 },
  { label: "Oct", donations: 39100, credits: 1702 },
  { label: "Nov", donations: 41800, credits: 1835 },
  { label: "Dec", donations: 44550, credits: 1912 },
  { label: "Jan", donations: 47200, credits: 2050 },
  { label: "Feb", donations: 50100, credits: 2185 },
];

const recentActivity: DashboardActivity[] = [
  {
    id: "a-001",
    type: "donation",
    title: "Donation batch settled",
    detail: "$12,400 processed across 34 transactions",
    timestamp: "2026-02-24T08:43:00Z",
  },
  {
    id: "a-002",
    type: "mint",
    title: "Credits minted",
    detail: "420 credits minted for Sahel Agroforestry Expansion",
    timestamp: "2026-02-24T06:12:00Z",
  },
  {
    id: "a-003",
    type: "project",
    title: "Project moved to pending",
    detail: "Regenerative Cotton Initiative submitted for review",
    timestamp: "2026-02-23T18:01:00Z",
  },
  {
    id: "a-004",
    type: "retire",
    title: "Credits retired",
    detail: "188 credits retired by enterprise buyer ACME Foods",
    timestamp: "2026-02-23T15:27:00Z",
  },
  {
    id: "a-005",
    type: "project",
    title: "Project archived",
    detail: "Drip Optimization Pilot closed after completion",
    timestamp: "2026-02-22T19:35:00Z",
  },
];

function computeMetrics() {
  const activeProjects = mockProjects.filter((project) => project.status === "active").length;
  const pendingProjects = mockProjects.filter((project) => project.status === "pending").length;
  const archivedProjects = mockProjects.filter((project) => project.status === "archived").length;

  return {
    totalProjects: mockProjects.length,
    activeProjects,
    pendingProjects,
    archivedProjects,
    totalDonationsProcessed: 437_950,
    totalCreditsMinted: 18_420,
    totalCreditsRetired: 15_210,
  };
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  return {
    metrics: computeMetrics(),
    trends: mockTrendPoints,
    recentActivity,
  };
}
