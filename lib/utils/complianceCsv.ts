interface ComplianceReportInput {
  standard: string;
  generatedAt: string;
  metrics: Record<string, number | string>;
}

export function buildComplianceCsv(report: ComplianceReportInput): string {
  const rows: string[] = [
    'metric,value',
    `standard,${report.standard}`,
    `generated_at,${report.generatedAt}`,
  ];
  for (const [key, value] of Object.entries(report.metrics)) {
    rows.push(`${key},${value}`);
  }
  return rows.join('\n');
}
