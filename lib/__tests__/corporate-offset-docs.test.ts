import { describe, expect, it } from 'vitest';
import type { MonthlyReport, OffsetProgram } from '@/lib/corporate-offset';
import {
  calculateMonthlyPace,
  formatMonthlyReportCsv,
  formatMonthlyReportMarkdown,
} from '@/lib/corporate-offset-docs';

const mockProgram: OffsetProgram = {
  id: 'prog-123',
  companyName: 'Acme Climate Inc.',
  companyEmail: 'esg@acme.example',
  walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  annualTargetTco2e: 1200,
  autoPurchase: true,
  monthlyBudgetCap: 3000,
  preferredProjects: ['PROJ-AMZ-001'],
  preferredTypes: ['reforestation', 'agroforestry'],
  netZeroPledge: true,
  targetYear: 2030,
  status: 'active',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-06-01T00:00:00Z'),
};

const mockReport: MonthlyReport = {
  programId: 'prog-123',
  period: '2026-06-01',
  tonnesPurchased: 110,
  tonnesCumulative: 600,
  targetRemaining: 600,
  pctOfTarget: 50,
  amountSpent: 1980,
  projectsSupported: [
    { projectId: 'PROJ-AMZ-001', tonnes: 75 },
    { projectId: 'PROJ-AGF-009', tonnes: 35 },
  ],
  coBenefits: ['reforestation', 'agroforestry'],
  onTrack: true,
};

describe('corporate-offset-docs', () => {
  it('calculates monthly pace and on-track status accurately', () => {
    const onTrack = calculateMonthlyPace(1200, 600, 6);
    expect(onTrack.expectedPct).toBe(50);
    expect(onTrack.actualPct).toBe(50);
    expect(onTrack.variancePct).toBe(0);
    expect(onTrack.onTrack).toBe(true);
    expect(onTrack.monthlyRunRateTco2e).toBe(100);

    const behind = calculateMonthlyPace(1200, 200, 6);
    expect(behind.onTrack).toBe(false);
    expect(behind.variancePct).toBeLessThan(0);
  });

  it('formats an audit-ready Markdown monthly report', () => {
    const md = formatMonthlyReportMarkdown(mockProgram, mockReport);
    expect(md).toContain('# Corporate Carbon Offset Monthly Report — 2026-06');
    expect(md).toContain('**Organization:** Acme Climate Inc.');
    expect(md).toContain('| Annual Offset Target | 1,200 tCO2e |');
    expect(md).toContain('| Tonnes Purchased (Period) | 110.00 tCO2e |');
    expect(md).toContain('| PROJ-AMZ-001 | 75.00 tCO2e |');
    expect(md).toContain('Net-Zero Pledge:** Yes (Target Year: 2030)');
  });

  it('formats a CSV monthly report with one row per supported project', () => {
    const csv = formatMonthlyReportCsv(mockProgram, mockReport);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('program_id,company_name,wallet_address');
    expect(lines[1]).toContain('PROJ-AMZ-001,75.00');
    expect(lines[2]).toContain('PROJ-AGF-009,35.00');
  });

  it('formats CSV gracefully when no projects were supported in the period', () => {
    const emptyReport: MonthlyReport = {
      ...mockReport,
      tonnesPurchased: 0,
      amountSpent: 0,
      projectsSupported: [],
    };
    const csv = formatMonthlyReportCsv(mockProgram, emptyReport);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(',0.00');
  });
});
