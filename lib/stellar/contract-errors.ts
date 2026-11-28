/**
 * Contract error-code resolver - Issue #1813
 *
 * Maps the numeric code in a Soroban `Error(Contract, #N)` failure to the
 * contract that owns it, using the block registry in
 * contracts/error-code-ranges.json (see docs/CONTRACT_ERROR_CODES.md).
 */

import registry from '@/contracts/error-code-ranges.json';

export interface ContractErrorRef {
  code: number;
  /** Crate that owns the code, or null for legacy/unknown codes. */
  contract: string | null;
}

const CONTRACT_ERROR_RE = /Error\(Contract,\s*#(\d+)\)/;

const LEGACY = new Set<string>(registry.legacy);

const BLOCKS = Object.entries(
  registry.ranges as unknown as Record<string, [number, number]>
).filter(([crate]) => !LEGACY.has(crate));

/** Extracts the contract error code from an error or message, if present. */
export function parseContractErrorCode(error: unknown): number | null {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const match = CONTRACT_ERROR_RE.exec(text);
  return match ? Number(match[1]) : null;
}

/** Finds the migrated crate whose block contains `code`. */
export function resolveContractError(code: number): ContractErrorRef {
  const block = BLOCKS.find(([, [min, max]]) => code >= min && code <= max);
  return { code, contract: block ? block[0] : null };
}

/** Convenience: parse then resolve. Returns null when no contract code is found. */
export function decodeContractError(error: unknown): ContractErrorRef | null {
  const code = parseContractErrorCode(error);
  return code === null ? null : resolveContractError(code);
}
