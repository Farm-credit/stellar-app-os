/**
 * CSV export safety for the farmer tax documents (issue #1362).
 *
 * A 1099-NEC export is opened by a tax clerk in Excel or Google Sheets, and
 * several of its cells are farmer-supplied: project references, verification
 * standards, buyer references and free-text memos. A cell whose first
 * character is `=`, `+`, `@`, TAB or CR is evaluated as a formula when the
 * sheet is opened (CSV injection, CWE-1236), so a memo such as
 * `=HYPERLINK("http://evil.example","click")` runs on the clerk's machine.
 *
 * `tax-reporting.ts` neutralises those cells with a leading apostrophe — which
 * spreadsheets read as "this cell is text" and every non-spreadsheet RFC 4180
 * parser ignores — while leaving ordinary text and negative amounts untouched.
 *
 * Assertions run against parsed cells rather than raw strings, so they also
 * pin the interaction between neutralisation and RFC 4180 quoting.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCarbonCreditSaleReport,
  buildForm1099Nec,
  carbonCreditSalesToCsv,
  convertIncomeSources,
  form1099NecToCsv,
  type PayerIdentity,
  type RecipientIdentity,
  type TaxableIncomeSource,
} from '../tax-reporting';

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

const GENERATED_AT = '2026-01-15T00:00:00.000Z';

/** Formula payloads a spreadsheet would execute. */
const FORMULA_PAYLOADS = [
  '=1+1',
  '=HYPERLINK("http://evil.example","click")',
  '+1+1',
  '@SUM(A1:A9)',
  '\t=1+1',
  '\r=1+1',
  '-2+3',
  '-cmd|/c calc',
];

function payout(reference: string, occurredAt: string, amount: number): TaxableIncomeSource {
  return {
    kind: 'payout',
    reference,
    occurredAt,
    amount,
    currency: 'USDC',
    assetCode: 'USDC',
  };
}

function carbonSale(
  reference: string,
  occurredAt: string,
  amount: number,
  creditsTons: number
): TaxableIncomeSource {
  return {
    kind: 'carbon_credit_sale',
    reference,
    occurredAt,
    amount,
    currency: 'USDC',
    assetCode: 'USDC',
    creditsTons,
    pricePerTon: 20,
    projectRef: 'proj-1',
    verificationStandard: 'Verra (VCS)',
    buyerRef: 'buyer-1',
  };
}

/** Minimal RFC 4180 reader so assertions see parsed cells, not raw text. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/** Builds a one-sale schedule and returns that sale's parsed row. */
function saleRow(overrides: Partial<TaxableIncomeSource>): string[] {
  const source = {
    ...carbonSale('sale-1', '2024-06-01T00:00:00.000Z', 10, 1),
    ...overrides,
  } as TaxableIncomeSource;
  const report = buildCarbonCreditSaleReport(convertIncomeSources([source]).records, 2024);
  return parseCsv(carbonCreditSalesToCsv(report))[1];
}

function cell(row: string[], column: string): string {
  const report = buildCarbonCreditSaleReport(
    convertIncomeSources([carbonSale('sale-1', '2024-06-01T00:00:00.000Z', 10, 1)]).records,
    2024
  );
  const header = parseCsv(carbonCreditSalesToCsv(report))[0];
  const index = header.indexOf(column);
  if (index === -1) throw new Error(`unknown column ${column}`);
  return row[index];
}

describe('tax export CSV safety', () => {
  describe('spreadsheet formula injection (CWE-1236)', () => {
    it.each(FORMULA_PAYLOADS)('neutralises a memo of %j', (payload) => {
      const memo = cell(saleRow({ memo: payload }), 'memo');
      expect(memo.startsWith("'")).toBe(true);
      expect(memo.slice(1)).toBe(payload);
    });

    it('neutralises formula-looking project, standard and buyer references', () => {
      const row = saleRow({
        projectRef: '=1+1',
        verificationStandard: '@SUM(1:1)',
        buyerRef: '+1+1',
      });

      expect(cell(row, 'project_ref')).toBe("'=1+1");
      expect(cell(row, 'verification_standard')).toBe("'@SUM(1:1)");
      expect(cell(row, 'buyer_ref')).toBe("'+1+1");
    });

    it('neutralises formula-looking recipient and payer names on the 1099-NEC', () => {
      const form = buildForm1099Nec({
        taxYear: 2024,
        recipient: { ...RECIPIENT, fullName: '=cmd|calc' },
        records: convertIncomeSources([payout('p', '2024-05-01T00:00:00.000Z', 10)]).records,
        payer: { ...PAYER, name: '=SUM(A1)' },
        generatedAt: GENERATED_AT,
      });

      const lookup = new Map(parseCsv(form1099NecToCsv(form)).map((r) => [r[0], r[1]]));
      expect(lookup.get('recipient_name')).toBe("'=cmd|calc");
      expect(lookup.get('payer_name')).toBe("'=SUM(A1)");
    });

    it('neutralises the cell before RFC 4180 quoting, so commas survive', () => {
      const withComma = '=SUM(A1:A9),tail';
      const quoted = cell(saleRow({ memo: withComma }), 'memo');

      // One leading apostrophe, the original text intact, and the comma parsed
      // back as data rather than a delimiter.
      expect(quoted).toBe(`'${withComma}`);
      expect(quoted.split(',').length).toBe(2);
    });

    it('does not touch plain text', () => {
      expect(cell(saleRow({ memo: 'Coffee run' }), 'memo')).toBe('Coffee run');
      expect(cell(saleRow({ memo: 'Verra (VCS) registry note' }), 'memo')).toBe(
        'Verra (VCS) registry note'
      );
    });

    it('does not touch legitimate negative amounts', () => {
      expect(cell(saleRow({ memo: '-12.50' }), 'memo')).toBe('-12.50');
      expect(cell(saleRow({ memo: '-1.5e3' }), 'memo')).toBe('-1.5e3');
    });

    it('leaves an `=` that is not the first character alone', () => {
      expect(cell(saleRow({ memo: 'co2 = 12 tCO2e' }), 'memo')).toBe('co2 = 12 tCO2e');
    });

    it('does not mangle the numeric columns', () => {
      const row = saleRow({ memo: '=1+1' });

      expect(cell(row, 'credits_tons')).toBe('1');
      expect(cell(row, 'price_per_ton')).toBe('20');
      expect(cell(row, 'amount_usd')).toBe('10');
      expect(cell(row, 'reference')).toBe('sale-1');
      expect(cell(row, 'memo')).toBe("'=1+1");
    });

    it('leaves empty and missing memos empty', () => {
      expect(cell(saleRow({ memo: null }), 'memo')).toBe('');
      expect(cell(saleRow({ memo: undefined }), 'memo')).toBe('');
      expect(cell(saleRow({ memo: '' }), 'memo')).toBe('');
    });
  });
});
