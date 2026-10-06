import { describe, expect, it } from 'vitest';
import {
  FORM_1099_NEC_FILING_THRESHOLD_USD,
  buildCarbonCreditSaleReport,
  buildForm1099Nec,
  buildIncomeSummary,
  carbonCreditSalesToCsv,
  convertIncomeSources,
  form1099NecToCsv,
  getFxRates,
  incomeSummaryToCsv,
  isUsdPegged,
  type PayerIdentity,
  type RecipientIdentity,
  type TaxableIncomeSource,
} from '../tax-reporting';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RECIPIENT: RecipientIdentity = {
  planterId: 42,
  fullName: 'Ada Okafor',
  stellarAddress: 'GPLANTER12345678901234567890123456789012345678901234567890',
  countryCode: 'NG',
  region: 'Kaduna',
};

const PAYER: PayerIdentity = {
  name: 'FarmCredit Stellar',
  address: '1 Ledger Way',
  country: 'US',
  tin: '00-0000000',
};

function payout(
  reference: string,
  occurredAt: string,
  amount: number,
  assetCode = 'USDC'
): TaxableIncomeSource {
  return { kind: 'payout', reference, occurredAt, amount, currency: assetCode, assetCode };
}

function carbonSale(
  reference: string,
  occurredAt: string,
  amount: number,
  creditsTons: number,
  assetCode = 'USDC'
): TaxableIncomeSource {
  return {
    kind: 'carbon_credit_sale',
    reference,
    occurredAt,
    amount,
    currency: assetCode,
    assetCode,
    creditsTons,
    pricePerTon: creditsTons === 0 ? 0 : amount / creditsTons,
    projectRef: 'PROJ-1',
    verificationStandard: 'Verra VCS',
    buyerRef: 'buyer-9',
  };
}

// ── Currency conversion ───────────────────────────────────────────────────────

describe('convertIncomeSources', () => {
  it('treats USD and USDC as 1:1 with the reporting currency', () => {
    expect(isUsdPegged('usdc')).toBe(true);
    expect(isUsdPegged('XLM')).toBe(false);

    const { records, excluded } = convertIncomeSources([
      payout('tx1', '2024-03-15T10:00:00Z', 250, 'USDC'),
      payout('tx2', '2024-03-16T10:00:00Z', 100, 'USD'),
    ]);

    expect(excluded).toHaveLength(0);
    expect(records.map((record) => record.amountUsd)).toEqual([250, 100]);
    expect(records[0].fxRate).toBeNull();
    expect(records[0].converted).toBe(false);
  });

  it('converts non-USD assets with a configured FX rate', () => {
    const { records, excluded } = convertIncomeSources(
      [payout('tx1', '2024-03-15T10:00:00Z', 1000, 'XLM')],
      { XLM: 0.12 }
    );

    expect(excluded).toHaveLength(0);
    expect(records[0].amountUsd).toBe(120);
    expect(records[0].fxRate).toBe(0.12);
    expect(records[0].converted).toBe(true);
  });

  it('excludes non-USD assets when no rate is configured instead of dropping them silently', () => {
    const { records, excluded } = convertIncomeSources([
      payout('tx1', '2024-03-15T10:00:00Z', 1000, 'XLM'),
    ]);

    expect(records).toHaveLength(0);
    expect(excluded).toHaveLength(1);
    expect(excluded[0].assetCode).toBe('XLM');
    expect(excluded[0].reason).toMatch(/TAX_FX_RATES/);
  });

  it('excludes non-positive amounts', () => {
    const { records, excluded } = convertIncomeSources([
      payout('tx1', '2024-03-15T10:00:00Z', 0),
      payout('tx2', '2024-03-15T10:00:00Z', -50),
    ]);

    expect(records).toHaveLength(0);
    expect(excluded).toHaveLength(2);
    expect(excluded[0].reason).toMatch(/non-positive/i);
  });
});

// ── Income summary ────────────────────────────────────────────────────────────

describe('buildIncomeSummary', () => {
  it('aggregates payouts and carbon credit sales per month', () => {
    const { records, excluded } = convertIncomeSources([
      payout('tx1', '2024-01-10T00:00:00Z', 100),
      payout('tx2', '2024-01-20T00:00:00Z', 50.5),
      carbonSale('sale1', '2024-06-05T00:00:00Z', 200, 10),
    ]);

    const summary = buildIncomeSummary(records, 2024, excluded);

    expect(summary.grossUsd).toBe(350.5);
    expect(summary.payoutUsd).toBe(150.5);
    expect(summary.carbonCreditSaleUsd).toBe(200);
    expect(summary.counts).toEqual({ payout: 2, carbonCreditSale: 1, total: 3 });
    expect(summary.months).toHaveLength(12);
    expect(summary.months[0]).toMatchObject({
      month: '2024-01',
      grossUsd: 150.5,
      payoutUsd: 150.5,
      carbonCreditSaleUsd: 0,
      transactionCount: 2,
    });
    expect(summary.months[5]).toMatchObject({
      month: '2024-06',
      grossUsd: 200,
      carbonCreditSaleUsd: 200,
      transactionCount: 1,
    });
    expect(summary.months[11].month).toBe('2024-12');
  });

  it('is zero-filled for a year without income', () => {
    const summary = buildIncomeSummary([], 2024);

    expect(summary.grossUsd).toBe(0);
    expect(summary.counts.total).toBe(0);
    expect(summary.months.every((bucket) => bucket.grossUsd === 0)).toBe(true);
  });

  it('accumulates cents without binary float drift', () => {
    const { records } = convertIncomeSources([
      payout('tx1', '2024-01-01T00:00:00Z', 0.1),
      payout('tx2', '2024-01-02T00:00:00Z', 0.2),
    ]);

    expect(buildIncomeSummary(records, 2024).grossUsd).toBe(0.3);
  });
});

// ── Form 1099-NEC ─────────────────────────────────────────────────────────────

describe('buildForm1099Nec', () => {
  it('reports Box 1 as the USD gross and requires filing at or above the threshold', () => {
    const { records, excluded } = convertIncomeSources([
      payout('tx1', '2024-05-01T00:00:00Z', FORM_1099_NEC_FILING_THRESHOLD_USD),
    ]);

    const form = buildForm1099Nec({
      taxYear: 2024,
      recipient: RECIPIENT,
      records,
      excluded,
      payer: PAYER,
      recipientTin: '123-45-6789',
      generatedAt: '2024-12-31T00:00:00.000Z',
    });

    expect(form.formType).toBe('1099-NEC');
    expect(form.box1NonemployeeCompensation).toBe(600);
    expect(form.box4FederalIncomeTaxWithheld).toBe(0);
    expect(form.requiresFiling).toBe(true);
    expect(form.totals).toMatchObject({
      payoutUsd: 600,
      carbonCreditSaleUsd: 0,
      grossUsd: 600,
      payoutCount: 1,
      carbonCreditSaleCount: 0,
    });
    expect(form.generatedAt).toBe('2024-12-31T00:00:00.000Z');
  });

  it('does not require filing below the threshold', () => {
    const { records } = convertIncomeSources([payout('tx1', '2024-05-01T00:00:00Z', 599.99)]);
    const form = buildForm1099Nec({
      taxYear: 2024,
      recipient: RECIPIENT,
      records,
      payer: PAYER,
      recipientTin: '123-45-6789',
    });

    expect(form.box1NonemployeeCompensation).toBe(599.99);
    expect(form.requiresFiling).toBe(false);
  });

  it('includes carbon credit sale income in Box 1', () => {
    const { records } = convertIncomeSources([
      payout('tx1', '2024-02-01T00:00:00Z', 100),
      carbonSale('sale1', '2024-03-01T00:00:00Z', 900, 30),
    ]);

    const form = buildForm1099Nec({
      taxYear: 2024,
      recipient: RECIPIENT,
      records,
      payer: PAYER,
      recipientTin: '123-45-6789',
    });

    expect(form.box1NonemployeeCompensation).toBe(1000);
    expect(form.totals.carbonCreditSaleUsd).toBe(900);
    expect(form.salesRecords).toHaveLength(1);
    expect(form.payoutRecords).toHaveLength(1);
  });

  it('notes a missing recipient TIN and excluded income', () => {
    const { records, excluded } = convertIncomeSources([
      payout('tx1', '2024-05-01T00:00:00Z', 700),
      payout('tx2', '2024-05-02T00:00:00Z', 1000, 'XLM'),
    ]);

    const form = buildForm1099Nec({
      taxYear: 2024,
      recipient: RECIPIENT,
      records,
      excluded,
      payer: PAYER,
    });

    expect(form.recipient.tin).toBeNull();
    expect(form.excludedSources).toHaveLength(1);
    expect(form.notes.join(' ')).toMatch(/W-9/);
    expect(form.notes.join(' ')).toMatch(/excluded from Box 1/);
  });

  it('notes FX conversion when a rate was applied', () => {
    const { records, excluded } = convertIncomeSources(
      [payout('tx1', '2024-05-01T00:00:00Z', 1000, 'XLM')],
      { XLM: 0.5 }
    );

    const form = buildForm1099Nec({
      taxYear: 2024,
      recipient: RECIPIENT,
      records,
      excluded,
      payer: PAYER,
      recipientTin: '123-45-6789',
    });

    expect(form.box1NonemployeeCompensation).toBe(500);
    expect(form.notes.join(' ')).toMatch(/converted to USD/);
    expect(form.notes.join(' ')).not.toMatch(/No reportable USD income/);
  });
});

// ── Carbon credit sale schedule ───────────────────────────────────────────────

describe('buildCarbonCreditSaleReport', () => {
  it('lists only carbon credit sales and totals tonnes and USD', () => {
    const { records, excluded } = convertIncomeSources([
      payout('tx1', '2024-01-01T00:00:00Z', 500),
      carbonSale('sale1', '2024-02-01T00:00:00Z', 300, 12),
      carbonSale('sale2', '2024-03-01T00:00:00Z', 150, 6),
    ]);

    const report = buildCarbonCreditSaleReport(records, 2024, excluded);

    expect(report.formType).toBe('carbon-credit-sales');
    expect(report.records).toHaveLength(2);
    expect(report.grossUsd).toBe(450);
    expect(report.totalCreditsTons).toBe(18);
    expect(report.records[0]).toMatchObject({
      reference: 'sale1',
      creditsTons: 12,
      pricePerTon: 25,
      projectRef: 'PROJ-1',
      verificationStandard: 'Verra VCS',
    });
  });

  it('has no records for a year without sales', () => {
    const report = buildCarbonCreditSaleReport([], 2024);
    expect(report.records).toHaveLength(0);
    expect(report.grossUsd).toBe(0);
    expect(report.totalCreditsTons).toBe(0);
  });
});

// ── FX rate configuration ─────────────────────────────────────────────────────

describe('getFxRates', () => {
  it('parses JSON rates and uppercases the asset keys', () => {
    expect(getFxRates({ TAX_FX_RATES: '{"xlm":0.12,"eur":1.08}' })).toEqual({
      XLM: 0.12,
      EUR: 1.08,
    });
  });

  it('ignores invalid, non-positive and non-numeric entries', () => {
    expect(getFxRates({ TAX_FX_RATES: '{"xlm":0,"eur":"abc","usdc":1}' })).toEqual({ USDC: 1 });
  });

  it('returns an empty map for missing or malformed configuration', () => {
    expect(getFxRates({})).toEqual({});
    expect(getFxRates({ TAX_FX_RATES: 'not-json' })).toEqual({});
    expect(getFxRates({ TAX_FX_RATES: '["xlm"]' })).toEqual({});
  });
});

// ── CSV serialisation ─────────────────────────────────────────────────────────

describe('CSV serialisation', () => {
  it('renders the 1099-NEC boxes as label/value rows', () => {
    const { records } = convertIncomeSources([payout('tx1', '2024-05-01T00:00:00Z', 750)]);
    const form = buildForm1099Nec({
      taxYear: 2024,
      recipient: RECIPIENT,
      records,
      payer: PAYER,
      recipientTin: '123-45-6789',
      generatedAt: '2024-12-31T00:00:00.000Z',
    });

    const csv = form1099NecToCsv(form);
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe('field,value');
    expect(csv).toContain('box1_nonemployee_compensation_usd,750.00');
    expect(csv).toContain('requires_filing,true');
    expect(csv).toContain('recipient_stellar_address,GPLANTER123');
  });

  it('quotes values containing commas', () => {
    const { records } = convertIncomeSources([payout('tx1', '2024-05-01T00:00:00Z', 100)]);
    const form = buildForm1099Nec({
      taxYear: 2024,
      recipient: { ...RECIPIENT, fullName: 'Okafor, Ada' },
      records,
      payer: { ...PAYER, address: '1 Ledger Way, Suite 5' },
    });

    const csv = form1099NecToCsv(form);

    expect(csv).toContain('"Okafor, Ada"');
    expect(csv).toContain('"1 Ledger Way, Suite 5"');
  });

  it('adds a totals row to the income summary', () => {
    const { records } = convertIncomeSources([payout('tx1', '2024-01-10T00:00:00Z', 125.5)]);
    const csv = incomeSummaryToCsv(buildIncomeSummary(records, 2024));

    expect(csv.split('\r\n')[0]).toBe(
      'month,gross_usd,payout_usd,carbon_credit_sale_usd,transaction_count'
    );
    expect(csv).toContain('2024-01,125.50,125.50,0.00,1');
    expect(csv).toContain('TOTAL,125.50,125.50,0.00,1');
  });

  it('lists carbon credit sales with a totals row', () => {
    const { records } = convertIncomeSources([carbonSale('sale1', '2024-02-01T00:00:00Z', 300, 12)]);
    const csv = carbonCreditSalesToCsv(buildCarbonCreditSaleReport(records, 2024));

    expect(csv).toContain('credits_tons');
    expect(csv).toContain('sale1');
    expect(csv).toContain('TOTAL');
    expect(csv).toContain('12');
  });
});
