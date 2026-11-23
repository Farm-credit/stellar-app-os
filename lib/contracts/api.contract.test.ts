import { describe, expect, it } from 'vitest';
import { PactV4, MatchersV3 } from '@pact-foundation/pact';
import { GET as getHealth } from '@/app/api/health/route';
import { loadOpenApiSpec, validateResponseAgainstSpec } from './openapi';

const pact = new PactV4({
  consumer: 'stellar-app-os-web',
  provider: 'stellar-app-os-api',
  dir: 'pacts',
  logLevel: 'warn',
});

describe('Pact API contract compliance', () => {
  it('validates the live health route against OpenAPI', async () => {
    const response = getHealth();
    const body = await response.json();
    const spec = await loadOpenApiSpec();

    expect(validateResponseAgainstSpec(spec, '/api/health', 'GET', response.status, body)).toEqual(
      []
    );
  });

  it('matches the published /api/health OpenAPI response', async () => {
    await pact
      .addInteraction()
      .uponReceiving('a health probe request')
      .withRequest('GET', '/api/health')
      .willRespondWith(200, (builder) =>
        builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
          status: MatchersV3.like('ok'),
          timestamp: '2026-11-23T08:44:32.813Z',
        })
      )
      .executeTest(async (mockServer) => {
        const response = await fetch(`${mockServer.url}/api/health`);
        const body = await response.json();
        const spec = await loadOpenApiSpec();
        expect(
          validateResponseAgainstSpec(spec, '/api/health', 'GET', response.status, body)
        ).toEqual([]);
      });
  });
});
