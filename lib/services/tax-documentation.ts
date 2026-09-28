/**
 * lib/services/tax-documentation.ts
 *
 * Orchestrates farmer tax documentation (v2): loads the planter's taxable
 * income for a calendar year, converts it to USD and builds the three
 * documents the tax endpoints serve —
 *
 *   1. Form 1099-NEC (Box 1, nonemployee compensation)
 *   2. Income summary (monthly breakdown, both income sources)
 *   3. Carbon credit sale records (line-item schedule)
 *
 * The heavy lifting lives in lib/tax/tax-reporting.ts (pure builders) and
 * lib/db/tax-documents.ts (queries), so this module stays a thin composition
 * layer that is easy to mock in route tests.
 */

import {
  buildCarbonCreditSaleReport,
  buildForm1099Nec,
  buildIncomeSummary,
  carbonCreditSalesToCsv,
  convertIncomeSources,
  form1099NecToCsv,
  getFxRates,
  getPayerIdentity,
  incomeSummaryToCsv,
  type CarbonCreditSaleReport,
  type Form1099Nec,
  type IncomeSummary,
  type RecipientIdentity,
  type TaxFormType,
} from '@/lib/tax/tax-reporting';
import {
  getCarbonCreditSales,
  getTaxablePayouts,
  type PlanterIdentityRow,
} from '@/lib/db/tax-documents';

export type TaxDocument = Form1099Nec | IncomeSummary | CarbonCreditSaleReport;

export interface TaxDocumentPayload {
  formType: TaxFormType;
  document: TaxDocument;
  /** USD total reported by this document (0 for an empty year). */
  grossAmount: number;
  /** Number of income line items behind the totals. */
  recordCount: number;
}

export interface GeneratedTaxDocuments {
  taxYear: number;
  planter: PlanterIdentityRow;
  recipient: RecipientIdentity;
  form1099Nec: Form1099Nec;
  incomeSummary: IncomeSummary;
  carbonCreditSales: CarbonCreditSaleReport;
  documents: TaxDocumentPayload[];
}

/** Builds every tax document for a planter and calendar year. */
export async function generateTaxDocuments(params: {
  planter: PlanterIdentityRow;
  taxYear: number;
  recipientTin?: string | null;
  /** Injectable for tests; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}): Promise<GeneratedTaxDocuments> {
  const { planter, taxYear } = params;
  const env = params.env ?? process.env;

  const [payouts, carbonSales] = await Promise.all([
    getTaxablePayouts({ planterId: planter.id, taxYear }),
    getCarbonCreditSales({ planterId: planter.id, taxYear }),
  ]);

  const { records, excluded } = convertIncomeSources(
    [...payouts, ...carbonSales],
    getFxRates(env)
  );

  const recipient: RecipientIdentity = {
    planterId: planter.id,
    fullName: planter.full_name || planter.stellar_address,
    stellarAddress: planter.stellar_address,
    countryCode: planter.country_code,
    region: planter.region,
  };

  const form1099Nec = buildForm1099Nec({
    taxYear,
    recipient,
    records,
    excluded,
    payer: getPayerIdentity(env),
    recipientTin: params.recipientTin ?? null,
  });
  const incomeSummary = buildIncomeSummary(records, taxYear, excluded);
  const carbonCreditSales = buildCarbonCreditSaleReport(records, taxYear, excluded);

  return {
    taxYear,
    planter,
    recipient,
    form1099Nec,
    incomeSummary,
    carbonCreditSales,
    documents: [
      {
        formType: '1099-NEC',
        document: form1099Nec,
        grossAmount: form1099Nec.box1NonemployeeCompensation,
        recordCount: records.length,
      },
      {
        formType: 'income-summary',
        document: incomeSummary,
        grossAmount: incomeSummary.grossUsd,
        // One row per income event — the summary aggregates rather than lists.
        recordCount: incomeSummary.counts.total,
      },
      {
        formType: 'carbon-credit-sales',
        document: carbonCreditSales,
        grossAmount: carbonCreditSales.grossUsd,
        recordCount: carbonCreditSales.records.length,
      },
    ],
  };
}

/** CSV serialisation for a single document type (used by `?format=csv`). */
export function taxDocumentToCsv(documents: GeneratedTaxDocuments, formType: TaxFormType): string {
  switch (formType) {
    case '1099-NEC':
      return form1099NecToCsv(documents.form1099Nec);
    case 'income-summary':
      return incomeSummaryToCsv(documents.incomeSummary);
    case 'carbon-credit-sales':
      return carbonCreditSalesToCsv(documents.carbonCreditSales);
  }
}
