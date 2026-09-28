/**
 * Buyer CSR / ESG disclosure helpers — Issue #1379
 *
 * Builds a shareable ESG disclosure from buyer carbon-offset data so
 * companies can send a report to investors and stakeholders.
 */

export type EsgOffsetLine = {
  projectName: string;
  creditType: string;
  tonnesCo2e: number;
  verification: string;
};

export type EsgDisclosureInput = {
  companyName: string;
  period: string;
  totalTrees: number;
  totalCo2Offset: number;
  projectsSupported: string[];
  offsets?: EsgOffsetLine[];
};

export type EsgDisclosureReport = EsgDisclosureInput & {
  reportId: string;
  generatedAt: string;
  sharePath: string;
};

const SAMPLE_OFFSETS: EsgOffsetLine[] = [
  {
    projectName: 'Amazon Rainforest Restoration',
    creditType: 'ARR',
    tonnesCo2e: 180.4,
    verification: 'Verra VCS',
  },
  {
    projectName: 'Kenya Mangrove Planting',
    creditType: 'Blue carbon',
    tonnesCo2e: 142.1,
    verification: 'Gold Standard',
  },
  {
    projectName: 'Indonesia Peatland Protection',
    creditType: 'REDD+',
    tonnesCo2e: 127.7,
    verification: 'Verra VCS',
  },
];

export function defaultEsgDisclosure(): EsgDisclosureInput {
  return {
    companyName: 'Acme Corp',
    period: 'Q1 2026',
    totalTrees: 12_500,
    totalCo2Offset: 450.2,
    projectsSupported: SAMPLE_OFFSETS.map((line) => line.projectName),
    offsets: SAMPLE_OFFSETS,
  };
}

export function buildEsgReportId(companyName: string, period: string): string {
  const slug = companyName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  const periodSlug = period.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return `ESG-${periodSlug || 'PERIOD'}-${slug || 'BUYER'}`;
}

export function buildEsgSharePath(input: EsgDisclosureInput): string {
  const params = new URLSearchParams({
    company: input.companyName,
    period: input.period,
    trees: String(input.totalTrees),
    co2: String(input.totalCo2Offset),
    projects: input.projectsSupported.join('|'),
  });
  return `/esg-disclosure?${params.toString()}`;
}

export function parseEsgShareParams(params: URLSearchParams): EsgDisclosureInput {
  const defaults = defaultEsgDisclosure();
  const projects = params.get('projects');
  const trees = Number(params.get('trees'));
  const co2 = Number(params.get('co2'));

  return {
    companyName: params.get('company')?.trim() || defaults.companyName,
    period: params.get('period')?.trim() || defaults.period,
    totalTrees: Number.isFinite(trees) && trees >= 0 ? trees : defaults.totalTrees,
    totalCo2Offset: Number.isFinite(co2) && co2 >= 0 ? co2 : defaults.totalCo2Offset,
    projectsSupported: projects
      ? projects
          .split('|')
          .map((name) => name.trim())
          .filter(Boolean)
      : defaults.projectsSupported,
    offsets: defaults.offsets,
  };
}

export function createEsgDisclosure(input: EsgDisclosureInput): EsgDisclosureReport {
  const companyName = input.companyName.trim() || 'Unnamed buyer';
  const period = input.period.trim() || 'Current period';
  const projectsSupported = input.projectsSupported.map((name) => name.trim()).filter(Boolean);
  const offsets = input.offsets?.length ? input.offsets : SAMPLE_OFFSETS;
  const report: EsgDisclosureReport = {
    companyName,
    period,
    totalTrees: Math.max(0, input.totalTrees),
    totalCo2Offset: Math.max(0, input.totalCo2Offset),
    projectsSupported,
    offsets,
    reportId: buildEsgReportId(companyName, period),
    generatedAt: new Date().toISOString(),
    sharePath: '',
  };
  report.sharePath = buildEsgSharePath(report);
  return report;
}
