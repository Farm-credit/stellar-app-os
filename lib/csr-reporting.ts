import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import type { BuyerComplianceReport } from '@/lib/esg-reporting-v2';

export type CsrReportStandard = 'gri' | 'tcfd';

export interface CsrReportTemplate {
  standard: 'GRI Standards' | 'TCFD';
  reportId: string;
  companyName: string;
  reportingPeriod: BuyerComplianceReport['period'];
  disclosures: Record<string, unknown>;
  dataGaps: string[];
  disclaimer: string;
}

export interface SignedCsrReport {
  standard: CsrReportTemplate['standard'];
  generatedAt: string;
  report: CsrReportTemplate;
  integrity: {
    algorithm: 'Ed25519';
    keyId: 'csr-report-v1';
    signature: string;
    publicKey: string;
  };
}

export function buildCsrReportTemplate(
  report: BuyerComplianceReport,
  standard: CsrReportStandard
): CsrReportTemplate {
  if (standard === 'gri') {
    return {
      standard: 'GRI Standards',
      reportId: report.reportId,
      companyName: report.companyName,
      reportingPeriod: report.period,
      disclosures: {
        general: {
          organizationName: report.companyName,
          reportingPeriod: report.period.label,
          sustainabilityReportIdentifier: report.reportId,
        },
        climateAndNature: {
          carbonOffsetPurchases: report.carbonOffsets,
          coBenefits: report.coBenefits,
          projectSupplyChain: report.supplyChain,
        },
        greenhouseGasInventory: {
          scope1TonnesCo2e: null,
          scope2TonnesCo2e: null,
          scope3TonnesCo2e: null,
          note: 'Offset purchases are not a substitute for a gross emissions inventory.',
        },
      },
      dataGaps: [
        'Gross Scope 1, Scope 2, and Scope 3 emissions inventory was not provided.',
        'This export is a structured reporting template and has not been independently assured.',
      ],
      disclaimer:
        'Structured for GRI-oriented reporting. This export is not a GRI Standards compliance assessment or assurance statement.',
    };
  }

  return {
    standard: 'TCFD',
    reportId: report.reportId,
    companyName: report.companyName,
    reportingPeriod: report.period,
    disclosures: {
      governance: { status: 'not_reported', boardAndManagementOversight: null },
      strategy: { status: 'not_reported', climateRisksAndOpportunities: null },
      riskManagement: { status: 'not_reported', processes: null },
      metricsAndTargets: {
        status: 'partial',
        offsetsPurchasedTonnesCo2e: report.carbonOffsets.totalTonnes,
        offsetsRetiredTonnesCo2e: report.carbonOffsets.retiredTonnes,
        projectsSupported: report.supplyChain.projectCount,
        coBenefits: report.coBenefits.allBenefits,
      },
    },
    dataGaps: [
      'Governance, climate scenario analysis, and climate-risk management disclosures were not provided.',
      'Emissions targets and gross Scope 1, Scope 2, and Scope 3 data were not provided.',
      'Offset purchases and retirements are reported separately and do not represent gross emissions reductions.',
    ],
    disclaimer:
      'Structured for TCFD-aligned reporting. This export is not a TCFD compliance assessment or assurance statement.',
  };
}

export function signCsrReport(
  report: CsrReportTemplate,
  privateKeyHex: string,
  generatedAt = new Date().toISOString()
): SignedCsrReport {
  if (!/^[0-9a-f]{64}$/i.test(privateKeyHex)) {
    throw new Error('CSR_REPORT_SIGNING_PRIVATE_KEY_HEX must be a 32-byte hex seed.');
  }

  const signedPayload = JSON.stringify({ generatedAt, report });
  const privateKey = hexToBytes(privateKeyHex);
  const message = new TextEncoder().encode(signedPayload);
  const signature = bytesToHex(ed25519.sign(message, privateKey));

  return {
    standard: report.standard,
    generatedAt,
    report,
    integrity: {
      algorithm: 'Ed25519',
      keyId: 'csr-report-v1',
      signature,
      publicKey: bytesToHex(ed25519.getPublicKey(privateKey)),
    },
  };
}
