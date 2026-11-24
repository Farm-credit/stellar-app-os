/**
 * Mock data for the corporate buyer dashboard.
 * All values are illustrative; replace with real API calls when available.
 */

/** UN Sustainable Development Goal numbers relevant to carbon markets */
export const CO_BENEFIT_SDG_MAP: Record<string, number[]> = {
  Biodiversity: [15],
  'Water Conservation': [6, 15],
  'Indigenous Communities': [10, 16],
  'Clean Energy': [7],
  'Job Creation': [8],
  'Coastal Protection': [14, 13],
  Fisheries: [14],
  'Soil Health': [15, 2],
  'Food Security': [2],
  'Farmer Income': [1, 8],
  'Wildfire Prevention': [15, 13],
  'Energy Access': [7, 1],
  Education: [4],
  Health: [3],
};

export interface OffsetPurchase {
  id: string;
  date: string;
  projectId: string;
  projectName: string;
  projectType: string;
  location: string;
  country: string;
  tons: number;
  pricePerTon: number;
  totalCost: number;
  verificationStandard: string;
  /** Serial number of the retirement certificate, when status === 'retired' */
  certificateSerial?: string;
  coBenefits: string[];
  vintage: number;
  status: 'retired' | 'pending' | 'active';
}

/** Annual offset commitment for the company */
export const annualTarget = {
  year: 2025,
  targetTons: 5000,
  label: 'FY 2025 Commitment',
};


export interface MonthlyTrend {
  month: string;
  tonsRetired: number;
  spend: number;
  avgPricePerTon: number;
}

export interface ProjectAllocation {
  projectId: string;
  projectName: string;
  projectType: string;
  location: string;
  country: string;
  tons: number;
  spend: number;
  avgPricePerTon: number;
  coBenefits: string[];
  verificationStandard: string;
  vintage: number;
  lat: number;
  lng: number;
}

export interface CoBenefitSummary {
  label: string;
  count: number; // number of purchases that carry this benefit
  tons: number;  // total tons associated
}

// ─── Purchases ────────────────────────────────────────────────────────────────

export const mockPurchases: OffsetPurchase[] = [
  {
    id: 'cp-001',
    date: '2024-01-15',
    projectId: 'proj-001',
    projectName: 'Amazon Rainforest Reforestation',
    projectType: 'Reforestation',
    location: 'Brazil, Amazon Basin',
    country: 'Brazil',
    tons: 500,
    pricePerTon: 44.0,
    totalCost: 22000,
    verificationStandard: 'Gold Standard',
    certificateSerial: 'GS-VER-2024-001-500',
    coBenefits: ['Biodiversity', 'Water Conservation', 'Indigenous Communities'],
    vintage: 2023,
    status: 'retired',
  },
  {
    id: 'cp-002',
    date: '2024-02-20',
    projectId: 'proj-002',
    projectName: 'Wind Energy Farm – Texas',
    projectType: 'Renewable Energy',
    location: 'Texas, USA',
    country: 'USA',
    tons: 300,
    pricePerTon: 37.5,
    totalCost: 11250,
    verificationStandard: 'Verra (VCS)',
    certificateSerial: 'VCS-2024-TX-0300',
    coBenefits: ['Clean Energy', 'Job Creation'],
    vintage: 2024,
    status: 'retired',
  },
  {
    id: 'cp-003',
    date: '2024-03-10',
    projectId: 'proj-004',
    projectName: 'Mangrove Restoration – Indonesia',
    projectType: 'Mangrove Restoration',
    location: 'Indonesia, Coastal Regions',
    country: 'Indonesia',
    tons: 250,
    pricePerTon: 54.0,
    totalCost: 13500,
    verificationStandard: 'Plan Vivo',
    certificateSerial: 'PV-2024-IDN-250',
    coBenefits: ['Coastal Protection', 'Fisheries', 'Biodiversity'],
    vintage: 2024,
    status: 'retired',
  },
  {
    id: 'cp-004',
    date: '2024-04-05',
    projectId: 'proj-005',
    projectName: 'Sustainable Agriculture – Kenya',
    projectType: 'Sustainable Agriculture',
    location: 'Kenya, East Africa',
    country: 'Kenya',
    tons: 200,
    pricePerTon: 34.0,
    totalCost: 6800,
    verificationStandard: 'Gold Standard',
    coBenefits: ['Soil Health', 'Food Security', 'Farmer Income'],
    vintage: 2022,
    status: 'active',
  },
  {
    id: 'cp-005',
    date: '2024-05-18',
    projectId: 'proj-001',
    projectName: 'Amazon Rainforest Reforestation',
    projectType: 'Reforestation',
    location: 'Brazil, Amazon Basin',
    country: 'Brazil',
    tons: 400,
    pricePerTon: 45.0,
    totalCost: 18000,
    verificationStandard: 'Gold Standard',
    coBenefits: ['Biodiversity', 'Water Conservation', 'Indigenous Communities'],
    vintage: 2024,
    status: 'active',
  },
  {
    id: 'cp-006',
    date: '2024-06-22',
    projectId: 'proj-006',
    projectName: 'Peatland Protection – Borneo',
    projectType: 'Peatland',
    location: 'Borneo, Malaysia',
    country: 'Malaysia',
    tons: 350,
    pricePerTon: 60.0,
    totalCost: 21000,
    verificationStandard: 'Verra (VCS)',
    coBenefits: ['Biodiversity', 'Wildfire Prevention', 'Indigenous Communities'],
    vintage: 2024,
    status: 'active',
  },
  {
    id: 'cp-007',
    date: '2024-08-30',
    projectId: 'proj-007',
    projectName: 'Solar Microgrids – Bangladesh',
    projectType: 'Renewable Energy',
    location: 'Rural Bangladesh',
    country: 'Bangladesh',
    tons: 180,
    pricePerTon: 41.0,
    totalCost: 7380,
    verificationStandard: 'Climate Action Reserve',
    coBenefits: ['Energy Access', 'Education', 'Health'],
    vintage: 2023,
    status: 'pending',
  },
  {
    id: 'cp-008',
    date: '2024-10-11',
    projectId: 'proj-002',
    projectName: 'Wind Energy Farm – Texas',
    projectType: 'Renewable Energy',
    location: 'Texas, USA',
    country: 'USA',
    tons: 220,
    pricePerTon: 38.0,
    totalCost: 8360,
    verificationStandard: 'Verra (VCS)',
    certificateSerial: 'VCS-2024-TX-0220',
    coBenefits: ['Clean Energy', 'Job Creation'],
    vintage: 2024,
    status: 'retired',
  },
  {
    id: 'cp-009',
    date: '2024-11-19',
    projectId: 'proj-005',
    projectName: 'Sustainable Agriculture – Kenya',
    projectType: 'Sustainable Agriculture',
    location: 'Kenya, East Africa',
    country: 'Kenya',
    tons: 160,
    pricePerTon: 35.5,
    totalCost: 5680,
    verificationStandard: 'Gold Standard',
    coBenefits: ['Soil Health', 'Food Security', 'Farmer Income'],
    vintage: 2022,
    status: 'active',
  },
  {
    id: 'cp-010',
    date: '2025-01-07',
    projectId: 'proj-004',
    projectName: 'Mangrove Restoration – Indonesia',
    projectType: 'Mangrove Restoration',
    location: 'Indonesia, Coastal Regions',
    country: 'Indonesia',
    tons: 300,
    pricePerTon: 56.0,
    totalCost: 16800,
    verificationStandard: 'Plan Vivo',
    coBenefits: ['Coastal Protection', 'Fisheries', 'Biodiversity'],
    vintage: 2024,
    status: 'active',
  },
  {
    id: 'cp-011',
    date: '2025-02-14',
    projectId: 'proj-006',
    projectName: 'Peatland Protection – Borneo',
    projectType: 'Peatland',
    location: 'Borneo, Malaysia',
    country: 'Malaysia',
    tons: 400,
    pricePerTon: 62.0,
    totalCost: 24800,
    verificationStandard: 'Verra (VCS)',
    coBenefits: ['Biodiversity', 'Wildfire Prevention', 'Indigenous Communities'],
    vintage: 2024,
    status: 'active',
  },
  {
    id: 'cp-012',
    date: '2025-03-25',
    projectId: 'proj-001',
    projectName: 'Amazon Rainforest Reforestation',
    projectType: 'Reforestation',
    location: 'Brazil, Amazon Basin',
    country: 'Brazil',
    tons: 500,
    pricePerTon: 46.5,
    totalCost: 23250,
    verificationStandard: 'Gold Standard',
    coBenefits: ['Biodiversity', 'Water Conservation', 'Indigenous Communities'],
    vintage: 2024,
    status: 'active',
  },
];

// ─── Monthly Trends ────────────────────────────────────────────────────────────

export const mockMonthlyTrends: MonthlyTrend[] = [
  { month: 'Jan 24', tonsRetired: 500, spend: 22000, avgPricePerTon: 44.0 },
  { month: 'Feb 24', tonsRetired: 300, spend: 11250, avgPricePerTon: 37.5 },
  { month: 'Mar 24', tonsRetired: 250, spend: 13500, avgPricePerTon: 54.0 },
  { month: 'Apr 24', tonsRetired: 200, spend: 6800, avgPricePerTon: 34.0 },
  { month: 'May 24', tonsRetired: 400, spend: 18000, avgPricePerTon: 45.0 },
  { month: 'Jun 24', tonsRetired: 350, spend: 21000, avgPricePerTon: 60.0 },
  { month: 'Jul 24', tonsRetired: 0, spend: 0, avgPricePerTon: 0 },
  { month: 'Aug 24', tonsRetired: 180, spend: 7380, avgPricePerTon: 41.0 },
  { month: 'Sep 24', tonsRetired: 0, spend: 0, avgPricePerTon: 0 },
  { month: 'Oct 24', tonsRetired: 220, spend: 8360, avgPricePerTon: 38.0 },
  { month: 'Nov 24', tonsRetired: 160, spend: 5680, avgPricePerTon: 35.5 },
  { month: 'Dec 24', tonsRetired: 0, spend: 0, avgPricePerTon: 0 },
  { month: 'Jan 25', tonsRetired: 300, spend: 16800, avgPricePerTon: 56.0 },
  { month: 'Feb 25', tonsRetired: 400, spend: 24800, avgPricePerTon: 62.0 },
  { month: 'Mar 25', tonsRetired: 500, spend: 23250, avgPricePerTon: 46.5 },
];

/** Same shape but for the prior year — used by the YoY overlay in the trend chart. */
export const mockMonthlyTrendsPriorYear: MonthlyTrend[] = [
  { month: 'Jan 23', tonsRetired: 320, spend: 13120, avgPricePerTon: 41.0 },
  { month: 'Feb 23', tonsRetired: 200, spend: 7200, avgPricePerTon: 36.0 },
  { month: 'Mar 23', tonsRetired: 180, spend: 9000, avgPricePerTon: 50.0 },
  { month: 'Apr 23', tonsRetired: 150, spend: 4950, avgPricePerTon: 33.0 },
  { month: 'May 23', tonsRetired: 300, spend: 13200, avgPricePerTon: 44.0 },
  { month: 'Jun 23', tonsRetired: 240, spend: 13920, avgPricePerTon: 58.0 },
  { month: 'Jul 23', tonsRetired: 90, spend: 3510, avgPricePerTon: 39.0 },
  { month: 'Aug 23', tonsRetired: 130, spend: 5200, avgPricePerTon: 40.0 },
  { month: 'Sep 23', tonsRetired: 60, spend: 2400, avgPricePerTon: 40.0 },
  { month: 'Oct 23', tonsRetired: 170, spend: 6120, avgPricePerTon: 36.0 },
  { month: 'Nov 23', tonsRetired: 110, spend: 3850, avgPricePerTon: 35.0 },
  { month: 'Dec 23', tonsRetired: 50, spend: 1750, avgPricePerTon: 35.0 },
];

export type DateRange = '3m' | '6m' | '1y' | 'all';

/** Returns purchases falling within the selected range, relative to today. */
export function filterPurchasesByRange(purchases: OffsetPurchase[], range: DateRange): OffsetPurchase[] {
  if (range === 'all') return purchases;
  const now = new Date();
  const months = range === '3m' ? 3 : range === '6m' ? 6 : 12;
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return purchases.filter((p) => new Date(p.date) >= cutoff);
}

// ─── Derived helpers ───────────────────────────────────────────────────────────

export function computePortfolioSummary(purchases: OffsetPurchase[]) {
  const totalTons = purchases.reduce((s, p) => s + p.tons, 0);
  const totalSpend = purchases.reduce((s, p) => s + p.totalCost, 0);
  const avgCostPerTon = totalTons > 0 ? totalSpend / totalTons : 0;
  const retiredTons = purchases
    .filter((p) => p.status === 'retired')
    .reduce((s, p) => s + p.tons, 0);
  const projectCount = new Set(purchases.map((p) => p.projectId)).size;

  return { totalTons, totalSpend, avgCostPerTon, retiredTons, projectCount };
}

export function computeProjectAllocations(purchases: OffsetPurchase[]): ProjectAllocation[] {
  const projectCoords: Record<string, { lat: number; lng: number }> = {
    'proj-001': { lat: -3.47, lng: -62.22 },
    'proj-002': { lat: 31.97, lng: -99.9 },
    'proj-004': { lat: -2.55, lng: 118.01 },
    'proj-005': { lat: -0.02, lng: 37.91 },
    'proj-006': { lat: 1.55, lng: 110.37 },
    'proj-007': { lat: 23.69, lng: 90.35 },
  };

  const byProject = new Map<string, ProjectAllocation>();

  for (const p of purchases) {
    const existing = byProject.get(p.projectId);
    if (existing) {
      existing.tons += p.tons;
      existing.spend += p.totalCost;
      existing.avgPricePerTon = existing.spend / existing.tons;
    } else {
      const coords = projectCoords[p.projectId] ?? { lat: 0, lng: 0 };
      byProject.set(p.projectId, {
        projectId: p.projectId,
        projectName: p.projectName,
        projectType: p.projectType,
        location: p.location,
        country: p.country,
        tons: p.tons,
        spend: p.totalCost,
        avgPricePerTon: p.pricePerTon,
        coBenefits: p.coBenefits,
        verificationStandard: p.verificationStandard,
        vintage: p.vintage,
        lat: coords.lat,
        lng: coords.lng,
      });
    }
  }

  return Array.from(byProject.values()).sort((a, b) => b.tons - a.tons);
}

export function computeCoBenefits(purchases: OffsetPurchase[]): CoBenefitSummary[] {
  const map = new Map<string, { count: number; tons: number }>();

  for (const p of purchases) {
    for (const cb of p.coBenefits) {
      const e = map.get(cb) ?? { count: 0, tons: 0 };
      e.count += 1;
      e.tons += p.tons;
      map.set(cb, e);
    }
  }

  return Array.from(map.entries())
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.tons - a.tons);
}
