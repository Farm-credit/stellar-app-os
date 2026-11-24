export type FundAllocationCategory =
  'Field operations' | 'Nursery costs' | 'Platform fee' | 'Overheads';

export interface FundAllocation {
  category: FundAllocationCategory;
  percentage: number;
  description: string;
  color: string;
}

export interface TransparencyRecord {
  projectId?: string;
  asOf: string;
  nextQuarterlyUpdate: string;
  annualAuditDate: string;
  auditReportUrl: string;
  allocations: FundAllocation[];
}

export const PLATFORM_FUND_ALLOCATIONS: FundAllocation[] = [
  {
    category: 'Field operations',
    percentage: 55,
    description: 'Planting, monitoring, and local stewardship teams.',
    color: '#00b36b',
  },
  {
    category: 'Nursery costs',
    percentage: 20,
    description: 'Seed collection, propagation, and sapling care.',
    color: '#14b6e7',
  },
  {
    category: 'Platform fee',
    percentage: 15,
    description: 'Payments, verification systems, and public reporting.',
    color: '#3e1bdb',
  },
  {
    category: 'Overheads',
    percentage: 10,
    description: 'Operations, compliance, and administration.',
    color: '#f59e0b',
  },
];

export const PROJECT_FUND_ALLOCATIONS: Record<string, FundAllocation[]> = {
  'proj-001': [
    {
      category: 'Field operations',
      percentage: 60,
      description: 'Local planting and restoration teams.',
      color: '#00b36b',
    },
    {
      category: 'Nursery costs',
      percentage: 18,
      description: 'Native Amazon seedling propagation.',
      color: '#14b6e7',
    },
    {
      category: 'Platform fee',
      percentage: 12,
      description: 'Verification, payments, and reporting.',
      color: '#3e1bdb',
    },
    {
      category: 'Overheads',
      percentage: 10,
      description: 'Compliance and administration.',
      color: '#f59e0b',
    },
  ],
};

export function getTransparencyRecord(projectId?: string): TransparencyRecord {
  return {
    projectId,
    asOf: '2026-09-30',
    nextQuarterlyUpdate: '2026-12-31',
    annualAuditDate: '2026-06-30',
    auditReportUrl: '/transparency/audit-report',
    allocations: projectId
      ? (PROJECT_FUND_ALLOCATIONS[projectId] ?? PLATFORM_FUND_ALLOCATIONS)
      : PLATFORM_FUND_ALLOCATIONS,
  };
}

export function allocationTotal(allocations: FundAllocation[]): number {
  return allocations.reduce((total, allocation) => total + allocation.percentage, 0);
}
