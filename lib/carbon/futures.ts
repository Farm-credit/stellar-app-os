export interface FuturesOrderInput {
  projectId: string;
  quantity: number;
  spotPricePerTon: number;
  deliveryYear: number;
  currentYear?: number;
  annualCarryRate?: number;
}

export interface FuturesQuote {
  projectId: string;
  quantity: number;
  deliveryYear: number;
  yearsToDelivery: number;
  lockedPricePerTon: number;
  notionalValue: number;
  annualCarryRate: number;
}

export interface CarbonFuturesContract extends FuturesQuote {
  id: string;
  status: 'open';
  createdAt: string;
}

export const DEFAULT_ANNUAL_CARRY_RATE = 0.05;
export const MAX_FUTURES_QUANTITY = 1_000_000;

export function getDeliveryYears(currentYear = new Date().getUTCFullYear()): number[] {
  return [currentYear + 1, currentYear + 2, currentYear + 3];
}

export function validateFuturesOrder(input: FuturesOrderInput): string | null {
  const currentYear = input.currentYear ?? new Date().getUTCFullYear();
  if (!input.projectId.trim()) return 'Select a carbon project.';
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return 'Quantity must be greater than zero.';
  }
  if (input.quantity > MAX_FUTURES_QUANTITY) {
    return `Quantity cannot exceed ${MAX_FUTURES_QUANTITY.toLocaleString()} tonnes.`;
  }
  if (!Number.isFinite(input.spotPricePerTon) || input.spotPricePerTon <= 0) {
    return 'The project spot price must be greater than zero.';
  }
  if (!Number.isInteger(input.deliveryYear) || input.deliveryYear <= currentYear) {
    return 'Delivery must be a future calendar year.';
  }
  return null;
}

export function quoteFuturesOrder(input: FuturesOrderInput): FuturesQuote {
  const error = validateFuturesOrder(input);
  if (error) throw new Error(error);

  const currentYear = input.currentYear ?? new Date().getUTCFullYear();
  const annualCarryRate = input.annualCarryRate ?? DEFAULT_ANNUAL_CARRY_RATE;
  const yearsToDelivery = input.deliveryYear - currentYear;
  const lockedPricePerTon = Number(
    (input.spotPricePerTon * (1 + annualCarryRate * yearsToDelivery)).toFixed(2)
  );

  return {
    projectId: input.projectId,
    quantity: input.quantity,
    deliveryYear: input.deliveryYear,
    yearsToDelivery,
    lockedPricePerTon,
    notionalValue: Number((lockedPricePerTon * input.quantity).toFixed(2)),
    annualCarryRate,
  };
}

export function createFuturesContract(
  input: FuturesOrderInput,
  options: { id: string; createdAt?: string }
): CarbonFuturesContract {
  return {
    ...quoteFuturesOrder(input),
    id: options.id,
    status: 'open',
    createdAt: options.createdAt ?? new Date().toISOString(),
  };
}
