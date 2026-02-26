export const MINIMUM_DONATION = 5;
export const TREES_PER_DOLLAR = 1;
export const HECTARES_PER_DOLLAR = 0.018;
export const CO2_PER_DOLLAR = 0.048;

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}
