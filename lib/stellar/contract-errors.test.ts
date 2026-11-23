import { describe, expect, it } from 'vitest';
import {
  decodeContractError,
  parseContractErrorCode,
  resolveContractError,
} from '@/lib/stellar/contract-errors';
import registry from '@/contracts/error-code-ranges.json';

describe('contract error codes', () => {
  it('parses codes out of Soroban error text', () => {
    expect(parseContractErrorCode('HostError: Error(Contract, #4103)')).toBe(4103);
    expect(parseContractErrorCode(new Error('failed: Error(Contract,#1706)'))).toBe(1706);
    expect(parseContractErrorCode('network timeout')).toBeNull();
    expect(parseContractErrorCode(undefined)).toBeNull();
  });

  it('resolves migrated codes to their contract', () => {
    expect(resolveContractError(4103)).toEqual({ code: 4103, contract: 'platform-governance' });
    expect(resolveContractError(1706).contract).toBe('carbon-fractionalization');
    expect(resolveContractError(3108).contract).toBe('impact-plot-shares');
  });

  it('does not attribute legacy or unknown codes', () => {
    expect(resolveContractError(3).contract).toBeNull();
    expect(resolveContractError(99999).contract).toBeNull();
  });

  it('decodes in one step', () => {
    expect(decodeContractError('Error(Contract, #4112)')?.contract).toBe('platform-governance');
    expect(decodeContractError('boom')).toBeNull();
  });

  it('registry blocks never overlap', () => {
    const blocks = Object.entries(
      registry.ranges as unknown as Record<string, [number, number]>
    ).sort((a, b) => a[1][0] - b[1][0]);
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i][1][0]).toBeGreaterThan(blocks[i - 1][1][1]);
    }
  });
});
