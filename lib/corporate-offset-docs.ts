import type { MonthlyReport, OffsetProgram } from './corporate-offset';

export interface MonthlyPaceSummary {
  expectedPct: number;
  actualPct: number;
  variancePct: number;
  onTrack: boolean;
  monthlyRunRateTco2e: number;
}

/**
 * Compute expected vs. actual progress pace for a given month (1-12).
 */
export function calculateMonthlyPace(
  annualTargetTco2e: number,
  cumulativeTco2e: number,
  monthNumber: number
): MonthlyPaceSummary {
  const clampedMonth = Math.min(Math.max(Math.floor(monthNumber), 1), 12);
  const expectedPct = Number(((clampedMonth / 12) * 100).toFixed(2));
  const actualPct =
    annualTargetTco2e > 0
      ? Number(Math.min((cumulativeTco2e / annualTargetTco2e) * 100, 100).toFixed(2))
      : 0;
  const variancePct = Number((actualPct - expectedPct).toFixed(2));
  const onTrack = actualPct >= expectedPct * 0.9;
  const monthlyRunRateTco2e = Number((cumulativeTco2e / clampedMonth).toFixed(2));

  return {
    expectedPct,
    actualPct,
    variancePct,
    onTrack,
    monthlyRunRateTco2e,
  };
}

/**
 * Generate an audit-ready Markdown ESG monthly report document for a company's
 * corporate carbon offset program.
 */
export function formatMonthlyReportMarkdown(
  program: OffsetProgram,
  report: MonthlyReport
): string {
  const periodLabel = report.period.slice(0, 7);
  const generatedDate = new Date().toISOString().slice(0, 10);
  const statusLabel = report.onTrack ? 'On Track' : 'Behind Pace';
  const budgetCapText =
    program.monthlyBudgetCap !== null
      ? `$${program.monthlyBudgetCap.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : 'No monthly cap';

  const projectRows =
    report.projectsSupported.length > 0
      ? report.projectsSupported
          .map((p) => `| ${p.projectId} | ${p.tonnes.toFixed(2)} tCO2e |`)
          .join('\n')
      : '| _No purchases recorded in period_ | 0.00 tCO2e |';

  const coBenefitsList =
    report.coBenefits.length > 0
      ? report.coBenefits.map((b) => `- ${b}`).join('\n')
      : '- Standard verified carbon removal / avoidance';

  return [
    `# Corporate Carbon Offset Monthly Report — ${periodLabel}`,
    '',
    `**Organization:** ${program.companyName}`,
    `**Contact Email:** ${program.companyEmail}`,
    `**Stellar Wallet:** \`${program.walletAddress}\``,
    `**Program ID:** \`${program.id}\``,
    `**Program Status:** ${program.status.toUpperCase()}`,
    `**Report Generated:** ${generatedDate}`,
    '',
    '---',
    '',
    '## 1. Executive Summary',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Reporting Period | ${periodLabel} |`,
    `| Annual Offset Target | ${program.annualTargetTco2e.toLocaleString('en-US')} tCO2e |`,
    `| Tonnes Purchased (Period) | ${report.tonnesPurchased.toFixed(2)} tCO2e |`,
    `| Cumulative Tonnes Offset | ${report.tonnesCumulative.toFixed(2)} tCO2e |`,
    `| Target Remaining | ${report.targetRemaining.toFixed(2)} tCO2e |`,
    `| Progress Toward Annual Target | ${report.pctOfTarget.toFixed(2)}% |`,
    `| Amount Spent (Period) | $${report.amountSpent.toFixed(2)} |`,
    `| Pace Status | ${statusLabel} |`,
    '',
    '## 2. Program Configuration & Commitments',
    '',
    `- **Automated Purchasing:** ${program.autoPurchase ? 'Enabled' : 'Disabled'}`,
    `- **Monthly Budget Cap:** ${budgetCapText}`,
    `- **Net-Zero Pledge:** ${program.netZeroPledge ? 'Yes' : 'No'}${program.targetYear ? ` (Target Year: ${program.targetYear})` : ''}`,
    `- **Preferred Project Types:** ${program.preferredTypes.length > 0 ? program.preferredTypes.join(', ') : 'Any verified type'}`,
    `- **Preferred Projects:** ${program.preferredProjects.length > 0 ? program.preferredProjects.join(', ') : 'None specified'}`,
    '',
    '## 3. Projects Supported in Period',
    '',
    '| Project ID | Tonnes Purchased |',
    '| --- | --- |',
    projectRows,
    '',
    '## 4. Co-Benefits & ESG Alignment',
    '',
    coBenefitsList,
    '',
    '---',
    '',
    '## 5. Verification & Disclosure Statement',
    '',
    'This report documents automated and manual carbon credit acquisitions executed through the',
    'Corporate Carbon Offset Program ledger. All quantities are reported in metric tonnes of',
    'carbon dioxide equivalent (tCO2e) for internal sustainability tracking and ESG disclosure.',
    '',
  ].join('\n');
}

function escapeCsvCell(value: string | number | boolean): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate a CSV export of the monthly carbon offset report.
 */
export function formatMonthlyReportCsv(program: OffsetProgram, report: MonthlyReport): string {
  const headers = [
    'program_id',
    'company_name',
    'wallet_address',
    'period',
    'annual_target_tco2e',
    'tonnes_purchased',
    'tonnes_cumulative',
    'target_remaining',
    'pct_of_target',
    'amount_spent_usd',
    'on_track',
    'project_id',
    'project_tonnes',
  ];

  const rows: string[] = [headers.join(',')];

  if (report.projectsSupported.length === 0) {
    rows.push(
      [
        program.id,
        program.companyName,
        program.walletAddress,
        report.period,
        program.annualTargetTco2e,
        report.tonnesPurchased.toFixed(2),
        report.tonnesCumulative.toFixed(2),
        report.targetRemaining.toFixed(2),
        report.pctOfTarget.toFixed(2),
        report.amountSpent.toFixed(2),
        report.onTrack,
        '',
        '0.00',
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  } else {
    for (const project of report.projectsSupported) {
      rows.push(
        [
          program.id,
          program.companyName,
          program.walletAddress,
          report.period,
          program.annualTargetTco2e,
          report.tonnesPurchased.toFixed(2),
          report.tonnesCumulative.toFixed(2),
          report.targetRemaining.toFixed(2),
          report.pctOfTarget.toFixed(2),
          report.amountSpent.toFixed(2),
          report.onTrack,
          project.projectId,
          project.tonnes.toFixed(2),
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }
  }

  return rows.join('\n');
}
