/**
 * Tree sponsorship tax deduction calculator.
 *
 * Provides sponsors with a built-in calculator estimating the potential
 * tax deduction value of their tree sponsorship based on their country
 * of residence. Calculations are indicative and not professional tax advice.
 */

export interface TaxRate {
  country: string;
  rate: number; // percentage of sponsorship value that may be tax-deductible
  notes?: string; // additional notes about the tax treatment
}

/**
 * Default tax rates by country (percentage of sponsorship value).
 * These are illustrative rates for demonstration purposes only.
 * Users should consult a tax professional for advice specific to their situation.
 */
export const TAX_RATES: TaxRate[] = [
  { country: 'United States', rate: 30, notes: 'Federal tax deduction may apply; consult a tax professional.' },
  { country: 'Canada', rate: 25, notes: 'Provincial and federal variations apply.' },
  { country: 'United Kingdom', rate: 28, notes: 'Gift Aid may enhance the effective deduction.' },
  { country: 'Germany', rate: 20, notes: 'Depends on individual tax situation.' },
  { country: 'Australia', rate: 33, notes: 'Charitable donation deduction rules apply.' },
  { country: 'France', rate: 25, notes: 'Déduction fiscale pour dons charitables.' },
  { country: 'India', rate: 20, notes: 'Section 80G applies for charitable donations.' },
  { country: 'Brazil', rate: 20, notes: 'Imposto de Renda pode ser dedutível.' },
  { country: 'South Africa', rate: 25, notes: 'Section 18A approved organisations qualify.' },
  { country: 'Default', rate: 15, notes: 'Rate for countries not specifically listed.' },
];

/**
 * Get the tax rate for a specific country.
 * Returns the default rate if the country is not in the list.
 */
export function getTaxRate(country: string): TaxRate {
  const found = TAX_RATES.find((r) => r.country.toLowerCase() === country.toLowerCase());
  return found ?? TAX_RATES[TAX_RATES.length - 1]; // return default
}

/**
 * Calculate the estimated tax deduction amount.
 *
 * @param sponsorshipValue The monetary value of the sponsorship (e.g. in USD or XLM)
 * @param country The user's country of residence
 * @returns The estimated tax deduction amount
 */
export function calculateDeduction(
  sponsorshipValue: number,
  country: string
): { deduction: number; taxRate: TaxRate; countryLabel: string } {
  const rateInfo = getTaxRate(country);
  const deduction = Math.round(sponsorshipValue * (rateInfo.rate / 100));
  return {
    deduction,
    taxRate: rateInfo,
    countryLabel: rateInfo.country,
  };
}

/**
 * Format the deduction amount with currency formatting.
 */
export function formatDeduction(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

/**
 * Get the disclaimer text to display alongside the calculator.
 */
export function getDisclaimer(): string {
  return (
    'This calculator provides indicative estimates only and is not '\n    +
    'a substitute for professional tax advice. Tax laws vary by jurisdiction '\n    +
    'and change over time. Please consult a qualified tax professional '\n    +
    'before making any financial decisions based on this calculation.'
  );
}