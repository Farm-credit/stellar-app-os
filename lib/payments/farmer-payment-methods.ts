import type { Pool } from 'pg';

export interface FarmerPaymentMethodFilters {
  currency?: string;
  method?: string;
}

export interface FarmerPaymentMethod {
  id: string;
  label: string;
  currency: string;
  method: string;
}

function readParam(
  input: URLSearchParams | Record<string, unknown>,
  key: string
): string | undefined {
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
  const value = input[key];
  return typeof value === 'string' ? value : undefined;
}

export function parseFarmerPaymentMethodFilters(
  input: URLSearchParams | Record<string, unknown>
): FarmerPaymentMethodFilters {
  return {
    currency: readParam(input, 'currency'),
    method: readParam(input, 'method'),
  };
}

export function getFarmerPaymentMethods(
  _pool: Pick<Pool, 'query'>,
  _filters: FarmerPaymentMethodFilters
): Promise<FarmerPaymentMethod[]> {
  return Promise.resolve([]);
}
