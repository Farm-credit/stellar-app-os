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

export interface CsrVerifyResult {
  valid: boolean;
  standard: CsrReportTemplate['standard'];
  reportId: string;
  companyName: string;
  generatedAt: string;
  publicKey: string;
  error?: string;
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
      /**
       * TCFD Pillar 1 — Governance
       * Disclose the organisation's governance around climate-related risks and
       * opportunities (board oversight, management role).
       * Status: not_reported — corporate sponsors must supply this narrative.
       */
      governance: {
        status: 'not_reported',
        boardOversight: null,
        managementRole: null,
        note: 'Provide a description of board and senior-management oversight of climate-related risks and opportunities to complete this pillar.',
      },
      /**
       * TCFD Pillar 2 — Strategy
       * Describe the actual and potential impacts of climate-related risks and
       * opportunities, including scenario analysis (1.5 °C / 2 °C / 4 °C).
       * Status: not_reported — requires scenario analysis input from the sponsor.
       */
      strategy: {
        status: 'not_reported',
        identifiedRisks: null,
        identifiedOpportunities: null,
        scenarioAnalysis: null,
        financialImpact: null,
        note: 'Provide climate-risk/opportunity descriptions and scenario analysis to complete this pillar.',
      },
      /**
       * TCFD Pillar 3 — Risk Management
       * Describe processes for identifying, assessing, and managing
       * climate-related risks and how they are integrated into overall
       * enterprise risk management.
       * Status: not_reported — requires internal risk-process documentation.
       */
      riskManagement: {
        status: 'not_reported',
        identificationProcess: null,
        assessmentProcess: null,
        integrationWithERM: null,
        note: 'Describe climate risk identification, assessment, and ERM integration to complete this pillar.',
      },
      /**
       * TCFD Pillar 4 — Metrics & Targets
       * Disclose the metrics and targets used to assess and manage relevant
       * climate-related risks and opportunities.
       * Status: partial — offset metrics sourced from platform data;
       * gross emissions inventory and reduction targets are not yet provided.
       */
      metricsAndTargets: {
        status: 'partial',
        offsetsPurchasedTonnesCo2e: report.carbonOffsets.totalTonnes,
        offsetsRetiredTonnesCo2e: report.carbonOffsets.retiredTonnes,
        activeTonnesCo2e: report.carbonOffsets.activeTonnes,
        totalCostUsd: report.carbonOffsets.totalCostUsd,
        costPerTonUsd: report.carbonOffsets.costPerTonUsd,
        purchaseCount: report.carbonOffsets.purchaseCount,
        projectCount: report.supplyChain.projectCount,
        retirementRate: report.supplyChain.retirementRate,
        coBenefits: report.coBenefits.allBenefits,
        scope1GrossEmissionsTonnesCo2e: null,
        scope2GrossEmissionsTonnesCo2e: null,
        scope3GrossEmissionsTonnesCo2e: null,
        emissionsReductionTarget: null,
        netZeroTargetYear: null,
        note: 'Gross Scope 1–3 emissions inventory and reduction targets must be provided to fully satisfy this pillar.',
      },
    },
    dataGaps: [
      'Governance pillar (board and management oversight): not reported — must be provided by the organisation.',
      'Strategy pillar (climate risks, opportunities, scenario analysis): not reported — must be provided by the organisation.',
      'Risk management pillar (identification, assessment, ERM integration): not reported — must be provided by the organisation.',
      'Gross Scope 1, Scope 2, and Scope 3 emissions inventory: not provided.',
      'Emissions reduction targets and net-zero commitment year: not provided.',
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

/**
 * Verifies the Ed25519 signature on a signed CSR report.
 *
 * Re-constructs the exact payload that was signed (`{ generatedAt, report }`)
 * and checks it against the embedded signature and public key. Returns a
 * structured result so callers can surface verification details in the UI or
 * API without throwing.
 */
export function verifyCsrReport(signed: SignedCsrReport): CsrVerifyResult {
  const base: CsrVerifyResult = {
    valid: false,
    standard: signed.standard,
    reportId: signed.report.reportId,
    companyName: signed.report.companyName,
    generatedAt: signed.generatedAt,
    publicKey: signed.integrity.publicKey,
  };

  try {
    if (signed.integrity.algorithm !== 'Ed25519') {
      return { ...base, error: `Unsupported algorithm: ${signed.integrity.algorithm}` };
    }

    // Rebuild the exact payload that was signed
    const signedPayload = JSON.stringify({ generatedAt: signed.generatedAt, report: signed.report });
    const message = new TextEncoder().encode(signedPayload);
    const signature = hexToBytes(signed.integrity.signature);
    const publicKey = hexToBytes(signed.integrity.publicKey);

    const valid = ed25519.verify(signature, message, publicKey);
    return { ...base, valid };
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : 'Signature verification failed',
    };
  }
}
