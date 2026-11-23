import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
  ProtocolVerificationError,
  getProtocolProjectById,
  getRegisteredProtocolProjects,
  validateAndIssueProtocolNft,
  validateCreditsAgainstProject,
} from '@/lib/api/protocol-verification';

const recipient = Keypair.random().publicKey();

async function expectError(promise: Promise<unknown>, code: string, status: number): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(ProtocolVerificationError);
  expect((error as ProtocolVerificationError).code).toBe(code);
  expect((error as ProtocolVerificationError).status).toBe(status);
}

describe('Verra / Gold Standard verification (#1259)', () => {
  it('lists and filters registered projects by protocol and country', async () => {
    const all = await getRegisteredProtocolProjects();
    expect(all.length).toBeGreaterThanOrEqual(3);
    const gs = await getRegisteredProtocolProjects({ protocol: 'Gold Standard' });
    expect(gs.every((p) => p.protocol === 'Gold Standard')).toBe(true);
    const kenya = await getRegisteredProtocolProjects({ country: 'kenya' });
    expect(kenya.map((p) => p.registryId)).toEqual(['GS-4820']);
  });

  it('finds a project by project id or registry id', async () => {
    expect((await getProtocolProjectById('VCS-2024-001'))?.registryId).toBe('VCS-1940');
    expect((await getProtocolProjectById('VCS-1940'))?.projectId).toBe('VCS-2024-001');
    expect(await getProtocolProjectById('nope')).toBeNull();
  });

  it('validates without allocating credits', async () => {
    const before = (await getProtocolProjectById('GS-2024-002'))!.availableCreditsTonnes;
    const result = await validateCreditsAgainstProject('GS-2024-002', 10);
    expect(result.remainingAfterTonnes).toBe(before - 10);
    expect((await getProtocolProjectById('GS-2024-002'))!.availableCreditsTonnes).toBe(before);
  });

  it('rejects invalid input, unknown and inactive projects, and over-allocation', async () => {
    await expectError(validateCreditsAgainstProject('', 5), 'invalid_request', 400);
    await expectError(validateCreditsAgainstProject('GS-2024-002', 0), 'invalid_request', 400);
    await expectError(
      validateCreditsAgainstProject('GS-2024-002', Number.NaN),
      'invalid_request',
      400
    );
    await expectError(validateCreditsAgainstProject('GS-2024-002', '5'), 'invalid_request', 400);
    await expectError(validateCreditsAgainstProject('missing', 5), 'project_not_found', 404);
    await expectError(
      validateCreditsAgainstProject('GS-2024-002', 1e12),
      'insufficient_credits',
      409
    );

    const project = (await getProtocolProjectById('VCS-2024-003'))!;
    project.active = false;
    try {
      await expectError(validateCreditsAgainstProject('VCS-2024-003', 1), 'project_inactive', 409);
    } finally {
      project.active = true;
    }
  });

  it('issues an NFT and decrements availability', async () => {
    const project = (await getProtocolProjectById('VCS-2024-001'))!;
    const available = project.availableCreditsTonnes;
    const issued = project.issuedCreditsTonnes;

    const nft = await validateAndIssueProtocolNft({
      projectId: 'VCS-2024-001',
      recipientAddress: recipient,
      creditsTonnes: 25,
    });

    expect(nft.tokenId).toMatch(/^NFT-VCS-/);
    expect(nft.transactionHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(nft.co2OffsetKg).toBe(25000);
    expect(nft.recipientAddress).toBe(recipient);
    expect(nft.serialNumbers).toContain(String(issued + 1).padStart(7, '0'));
    expect(project.availableCreditsTonnes).toBe(available - 25);

    const second = await validateAndIssueProtocolNft({
      projectId: 'VCS-2024-001',
      recipientAddress: recipient,
      creditsTonnes: 1,
    });
    expect(second.tokenId).not.toBe(nft.tokenId);
    expect(second.transactionHash).not.toBe(nft.transactionHash);
  });

  it('rejects an invalid recipient before allocating anything', async () => {
    const project = (await getProtocolProjectById('GS-2024-002'))!;
    const available = project.availableCreditsTonnes;
    await expectError(
      validateAndIssueProtocolNft({
        projectId: 'GS-2024-002',
        recipientAddress: 'not-a-stellar-key',
        creditsTonnes: 5,
      }),
      'invalid_request',
      400
    );
    expect(project.availableCreditsTonnes).toBe(available);
  });
});
