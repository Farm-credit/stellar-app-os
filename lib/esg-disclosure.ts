/**
 * Buyer CSR / ESG disclosure helpers — Issue #1317
 *
 * Builds a shareable ESG disclosure from buyer carbon-offset data so
 * companies can send a report to investors and stakeholders.
 *
 * Issue #1345 extended the disclosure with the two sections corporate
 * compliance reporting asks for: purchased co-benefits and per-project
 * supply-chain (chain-of-custody) impact, both carried through the share
 * link and the PDF/Excel exports.
 */

import type { BuyerAnalyticsSummary } from '@/lib/api/buyer-analytics';

export type EsgOffsetLine = {
  projectName: string;
  creditType: string;
  tonnesCo2e: number;
  verification: string;
};

/** A co-benefit provided by the buyer's purchased portfolio (#1413). */
export type EsgCoBenefitLine = {
  name: string;
  tonnes: number;
  sharePercentage: number;
};

/** One sourced project and how far its offsets travelled the custody chain. */
export type EsgSupplyChainLine = {
  projectName: string;
  location: string;
  tonnesCo2e: number;
  retiredTonnes: number;
  /** e.g. "4/5 stages complete" — chain-of-custody progress. */
  stageSummary: string;
};

export type EsgDisclosureInput = {
  companyName: string;
  period: string;
  totalTrees: number;
  totalCo2Offset: number;
  projectsSupported: string[];
  offsets?: EsgOffsetLine[];
  coBenefits?: EsgCoBenefitLine[];
  supplyChain?: EsgSupplyChainLine[];
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

const SAMPLE_CO_BENEFITS: EsgCoBenefitLine[] = [
  { name: 'Biodiversity', tonnes: 307.8, sharePercentage: 68.4 },
  { name: 'Livelihoods', tonnes: 269.8, sharePercentage: 60 },
];

const SAMPLE_SUPPLY_CHAIN: EsgSupplyChainLine[] = [
  {
    projectName: 'Amazon Rainforest Restoration',
    location: 'Brazil',
    tonnesCo2e: 180.4,
    retiredTonnes: 0,
    stageSummary: '4/5 stages complete',
  },
  {
    projectName: 'Kenya Mangrove Planting',
    location: 'Kenya',
    tonnesCo2e: 142.1,
    retiredTonnes: 142.1,
    stageSummary: '5/5 stages complete',
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
    coBenefits: SAMPLE_CO_BENEFITS,
    supplyChain: SAMPLE_SUPPLY_CHAIN,
  };
}

export function buildEsgReportId(companyName: string, period: string): string {
  const slug = companyName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  const periodSlug = period
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
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
  if (input.offsets?.length) params.set('offsets', JSON.stringify(input.offsets));
  if (input.coBenefits?.length) params.set('cobenefits', encodeEsgCoBenefits(input.coBenefits));
  if (input.supplyChain?.length) params.set('chain', encodeEsgSupplyChain(input.supplyChain));
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
    offsets: parseEsgOffsetsParam(params.get('offsets')),
    coBenefits: parseEsgCoBenefitsParam(params.get('cobenefits')),
    supplyChain: parseEsgSupplyChainParam(params.get('chain')),
  };
}

/** Reads the `offsets` share param, dropping anything that is not a valid line. */
export function parseEsgOffsetsParam(raw: string | null): EsgOffsetLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): EsgOffsetLine[] => {
      if (typeof item !== 'object' || item === null) return [];
      const line = item as Record<string, unknown>;
      const tonnes = Number(line.tonnesCo2e);
      if (
        typeof line.projectName !== 'string' ||
        typeof line.creditType !== 'string' ||
        typeof line.verification !== 'string' ||
        !Number.isFinite(tonnes) ||
        tonnes < 0
      ) {
        return [];
      }
      return [
        {
          projectName: line.projectName,
          creditType: line.creditType,
          tonnesCo2e: tonnes,
          verification: line.verification,
        },
      ];
    });
  } catch {
    return [];
  }
}

/** Serialises the co-benefits section onto the share link. */
export function encodeEsgCoBenefits(lines: EsgCoBenefitLine[]): string {
  return JSON.stringify(lines);
}

/** Serialises the supply-chain section onto the share link. */
export function encodeEsgSupplyChain(lines: EsgSupplyChainLine[]): string {
  return JSON.stringify(lines);
}

/** Reads the `cobenefits` share param, dropping anything that is not a valid line. */
export function parseEsgCoBenefitsParam(raw: string | null): EsgCoBenefitLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): EsgCoBenefitLine[] => {
      if (typeof item !== 'object' || item === null) return [];
      const line = item as Record<string, unknown>;
      const tonnes = Number(line.tonnes);
      const sharePercentage = Number(line.sharePercentage);
      if (
        typeof line.name !== 'string' ||
        !Number.isFinite(tonnes) ||
        tonnes < 0 ||
        !Number.isFinite(sharePercentage) ||
        sharePercentage < 0
      ) {
        return [];
      }
      return [{ name: line.name, tonnes, sharePercentage }];
    });
  } catch {
    return [];
  }
}

/** Reads the `chain` share param, dropping anything that is not a valid line. */
export function parseEsgSupplyChainParam(raw: string | null): EsgSupplyChainLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): EsgSupplyChainLine[] => {
      if (typeof item !== 'object' || item === null) return [];
      const line = item as Record<string, unknown>;
      const tonnesCo2e = Number(line.tonnesCo2e);
      const retiredTonnes = Number(line.retiredTonnes);
      if (
        typeof line.projectName !== 'string' ||
        typeof line.location !== 'string' ||
        typeof line.stageSummary !== 'string' ||
        !Number.isFinite(tonnesCo2e) ||
        tonnesCo2e < 0 ||
        !Number.isFinite(retiredTonnes) ||
        retiredTonnes < 0
      ) {
        return [];
      }
      return [
        {
          projectName: line.projectName,
          location: line.location,
          tonnesCo2e,
          retiredTonnes,
          stageSummary: line.stageSummary,
        },
      ];
    });
  } catch {
    return [];
  }
}

/**
 * 1 TREE token = 48 kg CO2 (CO2_KG_PER_TREE in lib/stellar/tree-asset.ts).
 * Mirrored here, as lib/api/ghg-protocol.ts does, so client code does not
 * import the Stellar SDK.
 */
const CO2_KG_PER_TREE = 48;

const PLATFORM_LABELS: Record<string, string> = {
  stellar: 'Stellar on-chain',
  'tree-registry': 'Tree registry',
  verra: 'Verra VCS',
  'gold-standard': 'Gold Standard',
  'climate-action-reserve': 'Climate Action Reserve',
  'plan-vivo': 'Plan Vivo',
  unverified: 'Unverified',
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Maps a buyer-analytics summary (real offset purchases) onto ESG disclosure
 * input. Trees supported is derived from sequestration tonnes.
 */
export function buildEsgInputFromAnalytics(
  summary: BuyerAnalyticsSummary,
  meta: { companyName: string; period: string }
): EsgDisclosureInput {
  const offsets: EsgOffsetLine[] = summary.supplyChain.map((project) => ({
    projectName: project.projectName,
    creditType:
      project.assetType === 'sequestration'
        ? 'Tree sequestration'
        : (project.projectType ?? 'Carbon credit'),
    tonnesCo2e: round1(project.tonnes),
    verification: PLATFORM_LABELS[project.platform] ?? project.platform,
  }));

  const coBenefits: EsgCoBenefitLine[] = (summary.coBenefits ?? []).map((benefit) => ({
    name: benefit.name,
    tonnes: round1(benefit.tonnes),
    sharePercentage: round1(benefit.sharePercentage),
  }));

  const supplyChain: EsgSupplyChainLine[] = summary.supplyChain.map((project) => {
    const stages = project.stages ?? [];
    const complete = stages.filter((stage) => stage.status === 'complete').length;
    return {
      projectName: project.projectName,
      location: project.location ?? '—',
      tonnesCo2e: round1(project.tonnes),
      retiredTonnes: round1(project.retiredTonnes ?? 0),
      stageSummary: `${complete}/${stages.length} stages complete`,
    };
  });

  return {
    companyName: meta.companyName,
    period: meta.period,
    totalTrees: Math.round((summary.totals.sequestrationTonnes * 1000) / CO2_KG_PER_TREE),
    totalCo2Offset: round1(summary.totals.totalTonnes),
    projectsSupported: offsets.map((line) => line.projectName),
    offsets,
    coBenefits,
    supplyChain,
  };
}

export function createEsgDisclosure(input: EsgDisclosureInput): EsgDisclosureReport {
  const companyName = input.companyName.trim() || 'Unnamed buyer';
  const period = input.period.trim() || 'Current period';
  const projectsSupported = input.projectsSupported.map((name) => name.trim()).filter(Boolean);
  const offsets = input.offsets ?? [];
  const coBenefits = input.coBenefits ?? [];
  const supplyChain = input.supplyChain ?? [];
  const report: EsgDisclosureReport = {
    companyName,
    period,
    totalTrees: Math.max(0, input.totalTrees),
    totalCo2Offset: Math.max(0, input.totalCo2Offset),
    projectsSupported,
    offsets,
    coBenefits,
    supplyChain,
    reportId: buildEsgReportId(companyName, period),
    generatedAt: new Date().toISOString(),
    sharePath: '',
  };
  report.sharePath = buildEsgSharePath(report);
  return report;
}
