import type {
  AnalyticsDataset,
  AnalyticsDateRange,
  AnalyticsDatePreset,
} from '@/lib/types/analytics';

// Stellar brand hex colours
const COLORS = {
  stellarBlue: '#14b6e7',
  stellarPurple: '#3e1bdb',
  stellarGreen: '#00b36b',
  stellarCyan: '#00c2ff',
  amber: '#f59e0b',
} as const;

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(from);
  const end = new Date(to);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * Generates a deterministic AnalyticsDataset for a given date range.
 * Uses Math.sin-based values so output is stable across renders.
 */
export function generateMockAnalyticsData(range: AnalyticsDateRange): AnalyticsDataset {
  const dates = datesBetween(range.from, range.to);

  const timeSeries = dates.map((date, i) => {
    const seed = i * 0.4;
    return {
      date,
      users: Math.round(120 + 80 * Math.sin(seed) + 40 * Math.sin(seed * 2.3)),
      transactions: Math.round(300 + 150 * Math.sin(seed * 1.5) + 60 * Math.sin(seed * 3.1)),
      revenue: Math.round(5000 + 3000 * Math.sin(seed * 0.8) + 1200 * Math.sin(seed * 2.1)),
    };
  });

  const donationCategories = [
    { name: 'Reforestation', value: 420, fill: COLORS.stellarBlue },
    { name: 'Renewable Energy', value: 310, fill: COLORS.stellarPurple },
    { name: 'Blue Carbon', value: 210, fill: COLORS.stellarGreen },
    { name: 'Direct Air Capture', value: 160, fill: COLORS.stellarCyan },
    { name: 'Sustainable Ag', value: 120, fill: COLORS.amber },
  ];

  const projectStatus = [
    { name: 'Active', value: 68, fill: COLORS.stellarGreen },
    { name: 'Pending Review', value: 15, fill: COLORS.amber },
    { name: 'Completed', value: 12, fill: COLORS.stellarBlue },
    { name: 'Suspended', value: 5, fill: COLORS.stellarPurple },
  ];

  return {
    timeSeries,
    donationCategories,
    projectStatus,
    lastUpdatedAt: Date.now(),
  };
}

/**
 * Builds an AnalyticsDateRange for a given preset (7, 30, or 90 days ending today).
 */
export function buildDefaultDateRange(presetDays: number): AnalyticsDateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (presetDays - 1));

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const preset = `${presetDays}d` as AnalyticsDatePreset;

  return {
    preset,
    from: fmt(from),
    to: fmt(to),
  };
}
