import { describe, expect, it } from 'vitest';
import goldStandardProject from './fixtures/gold-standard-project.json';
import verraProject from './fixtures/verra-project.json';
import { ProviderResponseError } from '../errors';
import type { ProviderHttpClient } from '../http-client';
import { GoldStandardClient } from '../providers/gold-standard';
import { VerraClient } from '../providers/verra';

function clientReturning(value: unknown): ProviderHttpClient {
  return { getJson: () => Promise.resolve(value) } as ProviderHttpClient;
}

describe('certification provider adapters', () => {
  it('maps a Verra fixture into the normalized project type', async () => {
    const project = await new VerraClient(clientReturning(verraProject)).getProject('VCS-1913');

    expect(project).toMatchObject({
      provider: 'verra',
      projectId: 'VCS-1913',
      status: 'active',
      countryCode: 'KE',
      methodologyId: 'VM0047',
      issuedCredits: 12000,
      availableCredits: 7500,
      retiredCredits: 4500,
    });
    expect(project.documents[0]).toMatchObject({
      externalId: 'DOC-1',
      status: 'accepted',
      sourceUrl: 'https://registry.example/documents/DOC-1',
    });
  });

  it('maps a Gold Standard fixture into the same normalized project type', async () => {
    const project = await new GoldStandardClient(clientReturning(goldStandardProject)).getProject(
      'GS-10422'
    );

    expect(project).toMatchObject({
      provider: 'gold-standard',
      projectId: 'GS-10422',
      name: 'Clean Cookstoves for Rural Households',
      status: 'registered',
      countryCode: 'UG',
      methodologyId: 'GS-TPDDTEC',
      issuedCredits: 8200,
    });
    expect(project.documents[0]).toMatchObject({
      externalId: 'GS-DOC-9',
      status: 'submitted',
    });
  });

  it('rejects malformed provider responses instead of persisting partial data', async () => {
    const client = new VerraClient(clientReturning({ id: 'VCS-1913', status: 'active' }));

    await expect(client.getProject('VCS-1913')).rejects.toBeInstanceOf(ProviderResponseError);
  });
});
