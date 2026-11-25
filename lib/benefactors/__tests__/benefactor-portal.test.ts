import { describe, expect, it } from 'vitest';
import { decryptAppreciationNote, encryptAppreciationNote } from '@/lib/benefactors/appreciation';
import { getProjectMilestones, MILESTONE_ORDER } from '@/lib/benefactors/milestones';
import { createSep7PoolPaymentUri } from '@/lib/stellar/subscription-sponsorship';

describe('benefactor portal domain helpers', () => {
  it('returns the five ordered restoration release gates with proof metadata', () => {
    const milestones = getProjectMilestones('project-1');
    expect(milestones.map((milestone) => milestone.key)).toEqual(MILESTONE_ORDER);
    expect(milestones[0].status).toBe('completed');
    expect(milestones[3].proofs[0].type).toBe('attestation');
    expect(milestones[4].status).toBe('upcoming');
  });

  it('round-trips an appreciation note without exposing plaintext in the envelope', () => {
    const envelope = encryptAppreciationNote(
      'Thank you for protecting this watershed.',
      'recipient-session-key'
    );
    expect(envelope.ciphertext).not.toContain('watershed');
    expect(decryptAppreciationNote(envelope, 'recipient-session-key')).toBe(
      'Thank you for protecting this watershed.'
    );
    expect(() => decryptAppreciationNote(envelope, 'wrong-key')).toThrow();
  });

  it('creates a SEP-0007 payment URI for a community pool', () => {
    const uri = createSep7PoolPaymentUri({
      destination: 'GDESTINATION',
      amount: '25',
      assetCode: 'USDC',
      memo: 'monthly pool',
    });
    expect(uri).toBe(
      'web+stellar:pay?destination=GDESTINATION&amount=25&asset_code=USDC&memo=monthly+pool'
    );
  });
});
