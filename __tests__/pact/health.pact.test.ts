/**
 * Health Check Contract Tests
 *
 * Tests the health check endpoint to ensure it matches the OpenAPI specification
 * and provides consistent, properly formatted responses.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPactProvider, getPactProviderUrl, createInteraction, PACT_PROVIDER, PACT_CONSUMER } from '../pact/setup';
import { validateResponse, loadOpenAPISpec } from '../pact/openapi-validator';
import { healthCheckMatcher, isoDateMatcher } from '../pact/matchers';
import fetch from 'node-fetch';

describe('Health Check Contract Tests', () => {
  const pact = createPactProvider();

  beforeAll(async () => {
    // Load and verify OpenAPI spec is available
    await loadOpenAPISpec();
  });

  afterAll(async () => {
    // Write pacts
    await pact.finalize();
  });

  describe('GET /api/health', () => {
    it('should return 200 with health status', async () => {
      const response = {
        status: 'ok',
        timestamp: new Date().toISOString(),
      };

      const interaction = createInteraction(
        'a GET request to the health endpoint',
        {
          method: 'GET',
          path: '/api/health',
        },
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: response,
        }
      );

      await pact.addInteraction(interaction);

      // Execute the test
      const url = `${getPactProviderUrl()}/api/health`;
      const result = await fetch(url, { method: 'GET' });
      const body = await result.json();

      // Verify response matches specification
      const validation = await validateResponse(
        { method: 'GET', path: '/api/health' },
        {
          status: result.status as number,
          headers: Object.fromEntries(result.headers.entries()),
          body,
        }
      );

      expect(result.status).toBe(200);
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');
      expect(body.status).toBe('ok');
      expect(validation.valid).toBe(true);
    });

    it('should have valid timestamp in ISO format', async () => {
      const timestamp = new Date().toISOString();
      const response = {
        status: 'ok',
        timestamp,
      };

      const interaction = createInteraction(
        'a GET request to health endpoint with valid timestamp',
        {
          method: 'GET',
          path: '/api/health',
        },
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: response,
        }
      );

      await pact.addInteraction(interaction);

      const url = `${getPactProviderUrl()}/api/health`;
      const result = await fetch(url, { method: 'GET' });
      const body = await result.json();

      // Validate ISO 8601 timestamp format
      expect(new Date(body.timestamp)).toBeInstanceOf(Date);
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('HEAD /api/health', () => {
    it('should return 200 for health check HEAD request', async () => {
      const interaction = createInteraction(
        'a HEAD request to the health endpoint',
        {
          method: 'GET', // Pact handles HEAD automatically
          path: '/api/health',
        },
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      await pact.addInteraction(interaction);

      const url = `${getPactProviderUrl()}/api/health`;
      const result = await fetch(url, { method: 'HEAD' });

      expect(result.status).toBe(200);
    });
  });

  describe('OpenAPI Compliance', () => {
    it('should have health endpoint defined in OpenAPI spec', async () => {
      const spec = await loadOpenAPISpec();
      expect(spec.paths).toHaveProperty('/api/health');
      expect(spec.paths['/api/health']).toHaveProperty('get');
    });

    it('should have correct response schema in OpenAPI spec', async () => {
      const spec = await loadOpenAPISpec();
      const healthPath = spec.paths['/api/health'].get;
      const responses = healthPath.responses;

      expect(responses).toHaveProperty('200');
      expect(responses['200'].content).toHaveProperty('application/json');
      expect(responses['200'].content['application/json']).toHaveProperty('schema');
    });

    it('should document status property as string', async () => {
      const spec = await loadOpenAPISpec();
      const schema = spec.paths['/api/health'].get.responses['200'].content['application/json'].schema;
      
      expect(schema.properties).toHaveProperty('status');
      expect(schema.properties.status.type).toBe('string');
      expect(schema.required).toContain('status');
    });

    it('should document timestamp property as ISO date-time', async () => {
      const spec = await loadOpenAPISpec();
      const schema = spec.paths['/api/health'].get.responses['200'].content['application/json'].schema;
      
      expect(schema.properties).toHaveProperty('timestamp');
      expect(schema.properties.timestamp.type).toBe('string');
      expect(schema.properties.timestamp.format).toBe('date-time');
      expect(schema.required).toContain('timestamp');
    });
  });
});
