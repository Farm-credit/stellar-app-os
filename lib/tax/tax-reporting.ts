/**
 * lib/tax/tax-reporting.ts
 *
 * Pure tax-documentation builders for farmer/planter income — v2 tax
 * documentation:
 *   * Form 1099-NEC (Box 1, nonemployee compensation)
 *   * Calendar-year income summaries (monthly breakdown)
 *   * Carbon credit sale records (line-item schedule)
 *
 * Nothing in this module touches the database or Next.js: route handlers load
 * rows through lib/db/tax-documents.ts and pass them in.  Keeping the money
 * maths, the USD conversion, the filing threshold logic and the CSV
 * serialisation side-effect free makes them unit-testable without Postgres.
 *
 * Reporting rules implemented here:
 *   - Box 1 must be a USD amount. USD/USDC pegged income counts 1:1; other
 *     assets count only when an FX rate is configured (TAX_FX_RATES, e.g.
 *     {"XLM":0.12}).  Anything left without a rate is surfaced in
 *     `excludedSources` rather than silently dropped.
 *   - Amounts are accumulated in cents to avoid binary float drift.
 *   - A 1099-NEC must be filed once gross nonemployee compensation for the
 *     calendar year reaches FORM_1099_NEC_FILING_THRESHOLD_USD ($600).
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** IRS filing threshold for Form 1099-NEC, Box 1 (nonemployee compensation). */
export const FORM_1099_NEC_FILING_THRESHOLD_USD = 600;

/** Bumped whenever the shape of a generated document changes. */
export const TAX_FORM_VERSION = '2026.1';

export const TAX_FORM_TYPES = ['1099-NEC', 'income-summary', 'carbon-credit-sales'] as const;

export type TaxFormType = (typeof TAX_FORM_TYPES)[number];

/** Currency the 1099-NEC is reported in. */
export const REPORTING_CURRENCY = 'USD';

/**
 * Assets treated as 1:1 with USD for reporting purposes. USDC is a Stellar
 * stablecoin; every other asset needs a configured FX rate.
 */
const USD_PEGGED_ASSETS = new Set(['USD', 'USDC']);

// ── Inputs ────────────────────────────────────────────────────────────────────

export type IncomeSourceKind = 'payout' | 'carbon_credit_sale';

/** A single income event as loaded from the database, before conversion. */
export interface TaxableIncomeSource {
  kind: IncomeSourceKind;
  /** On-chain tx hash or settlement/invoice reference. */
  reference: string;
  /** ISO-8601 timestamp the income was settled. */
  occurredAt: string;
  amount: number;
  /** Asset/currency the income was settled in (`XLM`, `USDC`, ...). */
  currency: string;
  assetCode: string;
  memo?: string | null;
  /* Carbon credit sale details (populated when kind === 'carbon_credit_sale') */
  creditsTons?: number;
  pricePerTon?: number;
  projectRef?: string | null;
  verificationStandard?: string | null;
  buyerRef?: string | null;
}

export interface RecipientIdentity {
  planterId: number;
  fullName: string;
  stellarAddress: string;
  countryCode?: string | null;
  region?: string | null;
}

export interface PayerIdentity {
  name: string;
  address: string;
  country: string;
  /** Payer TIN/EIN configured for the platform's filings. */
  tin: string | null;
}

/** USD rate per unit of asset, e.g. `{ XLM: 0.12 }`. */
export type FxRates = Record<string, number>;

// ── Outputs ───────────────────────────────────────────────────────────────────

export interface ExcludedSourceRecord {
  reference: string;
  occurredAt: string;
  amount: number;
  currency: string;
  assetCode: string;
  reason: string;
}

/** An income event converted to the reporting currency. */
export interface ReportableIncomeRecord {
  kind: IncomeSourceKind;
  reference: string;
  occurredAt: string;
  /** Amount as settled, in `currency`. */
  originalAmount: number;
  currency: string;
  assetCode: string;
  /** USD amount used in Box 1 / the income summary. */
  amountUsd: number;
  /** Rate applied for non-USD assets; `null` for USD-pegged income. */
  fxRate: number | null;
  converted: boolean;
  creditsTons?: number;
  pricePerTon?: number;
  projectRef?: string | null;
  verificationStandard?: string | null;
  buyerRef?: string | null;
  memo: string | null;
}

export interface IncomeMonthBucket {
  /** `YYYY-MM` */
  month: string;
  grossUsd: number;
  payoutUsd: number;
  carbonCreditSaleUsd: number;
  transactionCount: number;
}

export interface IncomeSummary {
  formType: 'income-summary';
  taxYear: number;
  version: string;
  currency: typeof REPORTING_CURRENCY;
  grossUsd: number;
  payoutUsd: number;
  carbonCreditSaleUsd: number;
  counts: { payout: number; carbonCreditSale: number; total: number };
  months: IncomeMonthBucket[];
  excludedSources: ExcludedSourceRecord[];
  generatedAt: string;
}

export interface Form1099Nec {
  formType: '1099-NEC';
  taxYear: number;
  version: string;
  currency: typeof REPORTING_CURRENCY;
  payer: PayerIdentity;
  recipient: RecipientIdentity & { tin: string | null };
  /** Box 1 — nonemployee compensation for the calendar year. */
  box1NonemployeeCompensation: number;
  /** Box 4 — federal income tax withheld (farmers are paid gross). */
  box4FederalIncomeTaxWithheld: number;
  requiresFiling: boolean;
  filingThreshold: number;
  totals: {
    payoutUsd: number;
    carbonCreditSaleUsd: number;
    grossUsd: number;
    payoutCount: number;
    carbonCreditSaleCount: number;
  };
  payoutRecords: ReportableIncomeRecord[];
  salesRecords: ReportableIncomeRecord[];
  excludedSources: ExcludedSourceRecord[];
  notes: string[];
  generatedAt: string;
}

export interface CarbonCreditSaleReport {
  formType: 'carbon-credit-sales';
  taxYear: number;
  version: string;
  currency: typeof REPORTING_CURRENCY;
  grossUsd: number;
  totalCreditsTons: number;
  records: ReportableIncomeRecord[];
  excludedSources: ExcludedSourceRecord[];
  generatedAt: string;
}

// ── Configuration ─────────────────────────────────────────────────────────────

function uppercaseKeys(record: Record<string, unknown>): FxRates {
  const rates: FxRates = {};
  for (const [key, value] of Object.entries(record)) {
    const rate = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(rate) && rate > 0) rates[key.toUpperCase()] = rate;
  }
  return rates;
}

/**
 * Parses `TAX_FX_RATES` (JSON object of asset → USD rate). Invalid entries are
 * ignored so a typo cannot produce a silently wrong 1099.
 */
export function getFxRates(env: NodeJS.ProcessEnv = process.env): FxRates {
  const raw = env.TAX_FX_RATES;
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return uppercaseKeys(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

/** Platform payer identity for the 1099 blocks, configurable per deployment. */
export function getPayerIdentity(env: NodeJS.ProcessEnv = process.env): PayerIdentity {
  return {
    name: env.TAX_PAYER_NAME ?? 'FarmCredit Stellar',
    address: env.TAX_PAYER_ADDRESS ?? '',
    country: env.TAX_PAYER_COUNTRY ?? 'US',
    tin: env.TAX_PAYER_TIN ?? null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function isUsdPegged(assetCode: string): boolean {
  return USD_PEGGED_ASSETS.has(assetCode.toUpperCase());
}

function monthKey(isoDate: string): string | null {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 7);
}

/**
 * Converts one raw income event to USD, or explains why it cannot be reported.
 * Returns `{ record }` on success and `{ excluded }` when the asset has neither
 * a USD peg nor a configured rate.
 */
export function convertIncomeSource(
  source: TaxableIncomeSource,
  rates: FxRates
): { record: ReportableIncomeRecord } | { excluded: ExcludedSourceRecord } {
  const assetCode = (source.assetCode || source.currency || '').toUpperCase();
  const amount = source.amount;

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      excluded: {
        reference: source.reference,
        occurredAt: source.occurredAt,
        amount,
        currency: source.currency,
        assetCode,
        reason: 'Non-positive or non-finite amount',
      },
    };
  }

  let amountUsd: number;
  let fxRate: number | null = null;

  if (isUsdPegged(assetCode)) {
    amountUsd = amount;
  } else {
    const rate = rates[assetCode];
    if (rate === undefined) {
      return {
        excluded: {
          reference: source.reference,
          occurredAt: source.occurredAt,
          amount,
          currency: source.currency,
          assetCode,
          reason: `No ${REPORTING_CURRENCY} rate configured for ${assetCode} — set TAX_FX_RATES before filing`,
        },
      };
    }
    fxRate = rate;
    amountUsd = amount * rate;
  }

  return {
    record: {
      kind: source.kind,
      reference: source.reference,
      occurredAt: source.occurredAt,
      originalAmount: round(amount, 7),
      currency: source.currency,
      assetCode,
      amountUsd: round(amountUsd, 2),
      fxRate,
      converted: fxRate !== null,
      creditsTons: source.creditsTons,
      pricePerTon: source.pricePerTon,
      projectRef: source.projectRef ?? null,
      verificationStandard: source.verificationStandard ?? null,
      buyerRef: source.buyerRef ?? null,
      memo: source.memo ?? null,
    },
  };
}

/** Splits raw income events into reportable (USD) records and excluded ones. */
export function convertIncomeSources(
  sources: TaxableIncomeSource[],
  rates: FxRates = {}
): { records: ReportableIncomeRecord[]; excluded: ExcludedSourceRecord[] } {
  const records: ReportableIncomeRecord[] = [];
  const excluded: ExcludedSourceRecord[] = [];

  for (const source of sources) {
    const result = convertIncomeSource(source, rates);
    if ('record' in result) records.push(result.record);
    else excluded.push(result.excluded);
  }

  return { records, excluded };
}

/** Twelve zero-filled month buckets so the summary shape is stable. */
function emptyMonthBuckets(taxYear: number): IncomeMonthBucket[] {
  return Array.from({ length: 12 }, (_, index) => ({
    month: `${taxYear}-${String(index + 1).padStart(2, '0')}`,
    grossUsd: 0,
    payoutUsd: 0,
    carbonCreditSaleUsd: 0,
    transactionCount: 0,
  }));
}

// ── Builders ──────────────────────────────────────────────────────────────────

export function buildIncomeSummary(
  records: ReportableIncomeRecord[],
  taxYear: number,
  excluded: ExcludedSourceRecord[] = []
): IncomeSummary {
  const months = emptyMonthBuckets(taxYear);
  const monthIndex = new Map(months.map((bucket, index) => [bucket.month, index]));
  const monthCents = months.map(() => ({ gross: 0, payout: 0, carbon: 0, count: 0 }));

  let grossCents = 0;
  let payoutCents = 0;
  let carbonCents = 0;
  let payoutCount = 0;
  let carbonCount = 0;

  for (const record of records) {
    const cents = Math.round(record.amountUsd * 100);
    grossCents += cents;
    if (record.kind === 'payout') {
      payoutCents += cents;
      payoutCount += 1;
    } else {
      carbonCents += cents;
      carbonCount += 1;
    }

    const key = monthKey(record.occurredAt);
    const index = key === null ? undefined : monthIndex.get(key);
    if (index !== undefined) {
      monthCents[index].gross += cents;
      monthCents[index].count += 1;
      if (record.kind === 'payout') monthCents[index].payout += cents;
      else monthCents[index].carbon += cents;
    }
  }

  months.forEach((bucket, index) => {
    bucket.grossUsd = monthCents[index].gross / 100;
    bucket.payoutUsd = monthCents[index].payout / 100;
    bucket.carbonCreditSaleUsd = monthCents[index].carbon / 100;
    bucket.transactionCount = monthCents[index].count;
  });

  return {
    formType: 'income-summary',
    taxYear,
    version: TAX_FORM_VERSION,
    currency: REPORTING_CURRENCY,
    grossUsd: grossCents / 100,
    payoutUsd: payoutCents / 100,
    carbonCreditSaleUsd: carbonCents / 100,
    counts: { payout: payoutCount, carbonCreditSale: carbonCount, total: payoutCount + carbonCount },
    months,
    excludedSources: excluded,
    generatedAt: new Date().toISOString(),
  };
}

/** Line-item schedule of every carbon credit sale in the tax year. */
export function buildCarbonCreditSaleReport(
  records: ReportableIncomeRecord[],
  taxYear: number,
  excluded: ExcludedSourceRecord[] = []
): CarbonCreditSaleReport {
  const sales = records.filter((record) => record.kind === 'carbon_credit_sale');
  let grossCents = 0;
  let tons = 0;

  for (const sale of sales) {
    grossCents += Math.round(sale.amountUsd * 100);
    if (Number.isFinite(sale.creditsTons)) tons += sale.creditsTons ?? 0;
  }

  return {
    formType: 'carbon-credit-sales',
    taxYear,
    version: TAX_FORM_VERSION,
    currency: REPORTING_CURRENCY,
    grossUsd: grossCents / 100,
    totalCreditsTons: round(tons, 4),
    records: sales,
    excludedSources: excluded,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Builds the 1099-NEC for a planter from already-converted USD records.
 *
 * `notes` carries the caveats a filing clerk needs (FX conversions, missing
 * TIN, sub-threshold year) and `excludedSources` keeps non-reportable income
 * visible instead of dropping it.
 */
export function buildForm1099Nec(params: {
  taxYear: number;
  recipient: RecipientIdentity;
  records: ReportableIncomeRecord[];
  excluded?: ExcludedSourceRecord[];
  payer?: PayerIdentity;
  recipientTin?: string | null;
  generatedAt?: string;
}): Form1099Nec {
  const { taxYear, recipient, records } = params;
  const excluded = params.excluded ?? [];
  const summary = buildIncomeSummary(records, taxYear, excluded);

  const convertedCount = records.filter((record) => record.converted).length;
  const notes: string[] = [];

  if (convertedCount > 0) {
    notes.push(
      `${convertedCount} income record(s) were converted to USD using the configured TAX_FX_RATES; verify the settlement-date rates before filing.`
    );
  }
  if (excluded.length > 0) {
    notes.push(
      `${excluded.length} income record(s) are excluded from Box 1 because no USD value could be determined.`
    );
  }
  if (!params.recipientTin) {
    notes.push(
      'Recipient TIN is not stored by this platform — collect a signed W-9 before filing the 1099-NEC.'
    );
  }
  if (summary.grossUsd === 0) {
    notes.push('No reportable USD income was found for this tax year.');
  }

  return {
    formType: '1099-NEC',
    taxYear,
    version: TAX_FORM_VERSION,
    currency: REPORTING_CURRENCY,
    payer: params.payer ?? getPayerIdentity(),
    recipient: { ...recipient, tin: params.recipientTin ?? null },
    box1NonemployeeCompensation: summary.grossUsd,
    box4FederalIncomeTaxWithheld: 0,
    requiresFiling: summary.grossUsd >= FORM_1099_NEC_FILING_THRESHOLD_USD,
    filingThreshold: FORM_1099_NEC_FILING_THRESHOLD_USD,
    totals: {
      payoutUsd: summary.payoutUsd,
      carbonCreditSaleUsd: summary.carbonCreditSaleUsd,
      grossUsd: summary.grossUsd,
      payoutCount: summary.counts.payout,
      carbonCreditSaleCount: summary.counts.carbonCreditSale,
    },
    payoutRecords: records.filter((record) => record.kind === 'payout'),
    salesRecords: records.filter((record) => record.kind === 'carbon_credit_sale'),
    excludedSources: excluded,
    notes,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
  };
}

// ── CSV serialisation ─────────────────────────────────────────────────────────

/** Wraps a value in double quotes and escapes internal quotes per RFC 4180. */
function csvEscape(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value);
  const safe = spreadsheetSafe(str);
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n') || safe.includes('\r')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/**
 * Characters a spreadsheet treats as the start of a formula. A cell beginning
 * with one of these is evaluated when the export is opened in Excel/Sheets, so
 * a farmer-supplied memo or project name could execute a formula against the
 * clerk's machine (CSV injection, CWE-1236).
 */
const FORMULA_PREFIXES = ['=', '+', '@', '\t', '\r'];

/**
 * `true` when `str` would be evaluated as a formula by a spreadsheet. A leading
 * `-` is only dangerous when what follows is not a plain number: `-12.50` must
 * keep being reported as a negative amount, while `-2+3` must not.
 */
function looksLikeFormula(str: string): boolean {
  if (str.length === 0) return false;
  if (str[0] === '-') return !Number.isFinite(Number(str));
  return FORMULA_PREFIXES.includes(str[0]);
}

/**
 * Neutralises a formula-looking cell by prefixing it with `'`, which makes
 * spreadsheets read the rest of the cell as text. The value is left untouched
 * for every non-spreadsheet CSV parser.
 */
function spreadsheetSafe(str: string): string {
  return looksLikeFormula(str) ? `'${str}` : str;
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

/** Label/value CSV of the 1099-NEC boxes plus the payer/recipient block. */
export function form1099NecToCsv(form: Form1099Nec): string {
  const rows: (string | number | null | undefined)[][] = [
    ['field', 'value'],
    ['form', '1099-NEC'],
    ['tax_year', form.taxYear],
    ['version', form.version],
    ['payer_name', form.payer.name],
    ['payer_address', form.payer.address],
    ['payer_country', form.payer.country],
    ['payer_tin', form.payer.tin],
    ['recipient_name', form.recipient.fullName],
    ['recipient_stellar_address', form.recipient.stellarAddress],
    ['recipient_country', form.recipient.countryCode],
    ['recipient_tin', form.recipient.tin],
    ['box1_nonemployee_compensation_usd', form.box1NonemployeeCompensation.toFixed(2)],
    ['box4_federal_income_tax_withheld_usd', form.box4FederalIncomeTaxWithheld.toFixed(2)],
    ['requires_filing', String(form.requiresFiling)],
    ['filing_threshold_usd', form.filingThreshold.toFixed(2)],
    ['payout_total_usd', form.totals.payoutUsd.toFixed(2)],
    ['carbon_credit_sale_total_usd', form.totals.carbonCreditSaleUsd.toFixed(2)],
    ['payout_count', form.totals.payoutCount],
    ['carbon_credit_sale_count', form.totals.carbonCreditSaleCount],
    ['generated_at', form.generatedAt],
  ];

  for (const note of form.notes) rows.push(['note', note]);

  return toCsv(rows);
}

/** Month-by-month income summary CSV with a totals row. */
export function incomeSummaryToCsv(summary: IncomeSummary): string {
  const rows: (string | number | null | undefined)[][] = [
    ['month', 'gross_usd', 'payout_usd', 'carbon_credit_sale_usd', 'transaction_count'],
  ];

  for (const bucket of summary.months) {
    rows.push([
      bucket.month,
      bucket.grossUsd.toFixed(2),
      bucket.payoutUsd.toFixed(2),
      bucket.carbonCreditSaleUsd.toFixed(2),
      bucket.transactionCount,
    ]);
  }

  rows.push([
    'TOTAL',
    summary.grossUsd.toFixed(2),
    summary.payoutUsd.toFixed(2),
    summary.carbonCreditSaleUsd.toFixed(2),
    summary.counts.total,
  ]);

  return toCsv(rows);
}

/** Line-item carbon credit sale schedule CSV. */
export function carbonCreditSalesToCsv(report: CarbonCreditSaleReport): string {
  const rows: (string | number | null | undefined)[][] = [
    [
      'sold_at',
      'reference',
      'credits_tons',
      'price_per_ton',
      'original_amount',
      'currency',
      'asset_code',
      'amount_usd',
      'fx_rate',
      'project_ref',
      'verification_standard',
      'buyer_ref',
      'memo',
    ],
  ];

  for (const record of report.records) {
    rows.push([
      record.occurredAt,
      record.reference,
      record.creditsTons ?? '',
      record.pricePerTon ?? '',
      record.originalAmount,
      record.currency,
      record.assetCode,
      record.amountUsd,
      record.fxRate ?? '',
      record.projectRef,
      record.verificationStandard,
      record.buyerRef,
      record.memo,
    ]);
  }

  rows.push([
    'TOTAL',
    '',
    report.totalCreditsTons,
    '',
    '',
    '',
    '',
    report.grossUsd,
    '',
    '',
    '',
    '',
    '',
  ]);

  return toCsv(rows);
}
