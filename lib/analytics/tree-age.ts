import type { Pool } from 'pg';

export interface TreeAgeInput {
  plantedDate: string;
  asOf?: string;
}

export interface TreeAge {
  years: number;
  months: number;
  label: string;
}

export interface TreeMilestoneInput {
  treeIds?: string[];
  asOf?: string;
  [key: string]: unknown;
}

export interface TreeMilestoneResult {
  processed: number;
  badges: string[];
}

function readParam(
  input: URLSearchParams | Record<string, unknown>,
  key: string
): string | undefined {
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
  const value = input[key];
  return typeof value === 'string' ? value : undefined;
}

export function parseTreeAgeInput(input: URLSearchParams | Record<string, unknown>): TreeAgeInput {
  return {
    plantedDate: readParam(input, 'plantedDate') ?? '',
    asOf: readParam(input, 'asOf'),
  };
}

export function getTreeAge(_input: TreeAgeInput): TreeAge {
  return { years: 0, months: 0, label: '0 years' };
}

export function parseTreeMilestoneInput(input: unknown): TreeMilestoneInput {
  return input as TreeMilestoneInput;
}

export function processTreeMilestones(
  _pool: Pick<Pool, 'query'>,
  _input: TreeMilestoneInput
): Promise<TreeMilestoneResult> {
  return Promise.resolve({ processed: 0, badges: [] });
}
