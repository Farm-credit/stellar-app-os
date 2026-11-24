import type { Pool } from 'pg';

export interface OffsetProjectSearchParams {
  projectType?: string;
  location?: string;
  certificationStandard?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface OffsetProject {
  id: string;
  name: string;
  projectType: string;
  location: string;
  price: number;
}

function readParam(
  input: URLSearchParams | Record<string, unknown>,
  key: string
): string | undefined {
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
  const value = input[key];
  return typeof value === 'string' ? value : undefined;
}

export function parseOffsetProjectSearchParams(
  input: URLSearchParams | Record<string, unknown>
): OffsetProjectSearchParams {
  return {
    projectType: readParam(input, 'projectType'),
    location: readParam(input, 'location'),
    certificationStandard: readParam(input, 'certificationStandard'),
    minPrice: Number(readParam(input, 'minPrice')) || undefined,
    maxPrice: Number(readParam(input, 'maxPrice')) || undefined,
  };
}

export function searchOffsetProjects(
  _pool: Pick<Pool, 'query'>,
  _params: OffsetProjectSearchParams
): Promise<OffsetProject[]> {
  return Promise.resolve([]);
}
