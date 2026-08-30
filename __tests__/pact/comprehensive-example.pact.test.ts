/**
 * Comprehensive Contract Testing Example
 *
 * This file demonstrates how to use Pact with OpenAPI validation
 * to ensure API contracts are enforced and documented properly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPactProvider, getPactProviderUrl, createInteraction } from '../pact/setup';
import { loadOpenAPISpec, getOpenAPIPaths, getPathOperations } from '../pact/openapi-validator';
import { reporter } from '../pact/reporter';
import fetch from 'node-fetch';

describe('Comprehensive Contract Testing Example', () => {
  const pact = createPactProvider();

  beforeAll(async () => {
    await loadOpenAPISpec();
    reporter.startReport();
  });

  afterAll(async () => {
    await pact.finalize();
    const report = reporter.finishReport();
    if (report) {
      reporter.saveHTMLReport(report);
      console.log('\n=== Validation Summary ===');
      console.log(report.summary);
      console.log(`Compliance: ${report.compliancePercentage}%`);
      console.log(`Tests: ${report.passedTests}/${report.totalTests} passed`);
    }
  });

  describe('Example: Complete API Lifecycle Test', () => {
    it('should follow complete user flow: authenticate → fetch trees → update status', async () => {
      // Step 1: Generate nonce for authentication
      const nonceInteraction = createInteraction(
        'Step 1: Generate authentication nonce',
        {
          method: 'POST',
          path: '/api/auth/nonce',
          headers: { 'Content-Type': 'application/json' },
          body: {
            publicKey: 'GBRPYHIL2CI3WHKSW7TALCQO4UQ2OE6HGRXSGTV2VFKOTMYTWLB4CG',
          },
        },
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            nonce: 'test-nonce-123',
            expiresIn: 300,
            timestamp: new Date().toISOString(),
          },
        }
      );

      await pact.addInteraction(nonceInteraction);

      // Execute step 1
      const nonceResponse = await fetch(`${getPactProviderUrl()}/api/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: 'GBRPYHIL2CI3WHKSW7TALCQO4UQ2OE6HGRXSGTV2VFKOTMYTWLB4CG',
        }),
      });

      const nonceData = await nonceResponse.json();
      expect(nonceResponse.status).toBe(200);
      expect(nonceData).toHaveProperty('nonce');

      reporter.addTestResult('/api/auth/nonce', 'POST', 'Generate nonce', {
        name: 'Generate nonce',
        status: 'pass',
        statusCode: 200,
        timestamp: new Date().toISOString(),
      });

      // Step 2: Verify signature and get token
      const verifyInteraction = createInteraction(
        'Step 2: Verify signature and authenticate',
        {
          method: 'POST',
          path: '/api/auth/verify',
          headers: { 'Content-Type': 'application/json' },
          body: {
            publicKey: 'GBRPYHIL2CI3WHKSW7TALCQO4UQ2OE6HGRXSGTV2VFKOTMYTWLB4CG',
            signature: 'signature_data',
            nonce: nonceData.nonce,
          },
        },
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            token: 'auth-token-xyz',
            expiresIn: 86400,
            user: {
              publicKey: 'GBRPYHIL2CI3WHKSW7TALCQO4UQ2OE6HGRXSGTV2VFKOTMYTWLB4CG',
              email: null,
              createdAt: new Date().toISOString(),
            },
          },
        }
      );

      await pact.addInteraction(verifyInteraction);

      const verifyResponse = await fetch(`${getPactProviderUrl()}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: 'GBRPYHIL2CI3WHKSW7TALCQO4UQ2OE6HGRXSGTV2VFKOTMYTWLB4CG',
          signature: 'signature_data',
          nonce: nonceData.nonce,
        }),
      });

      const verifyData = await verifyResponse.json();
      expect(verifyResponse.status).toBe(200);
      expect(verifyData).toHaveProperty('token');

      reporter.addTestResult('/api/auth/verify', 'POST', 'Verify signature', {
        name: 'Verify signature',
        status: 'pass',
        statusCode: 200,
        timestamp: new Date().toISOString(),
      });

      // Step 3: Fetch trees with auth token
      const treesInteraction = createInteraction(
        'Step 3: Fetch trees with authentication',
        {
          method: 'GET',
          path: '/api/trees',
          headers: { Authorization: `Bearer ${verifyData.token}` },
        },
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            data: [
              {
                id: 'tree-1',
                species: 'Acacia',
                status: 'alive',
                location: {
                  latitude: 0.1234,
                  longitude: 35.5678,
                },
                plantedAt: new Date().toISOString(),
              },
            ],
            pagination: {
              page: 1,
              pageSize: 10,
              total: 1,
              hasMore: false,
            },
          },
        }
      );

      await pact.addInteraction(treesInteraction);

      const treesResponse = await fetch(`${getPactProviderUrl()}/api/trees`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${verifyData.token}` },
      });

      const treesData = await treesResponse.json();
      expect(treesResponse.status).toBe(200);
      expect(treesData).toHaveProperty('data');

      reporter.addTestResult('/api/trees', 'GET', 'Fetch trees', {
        name: 'Fetch trees',
        status: 'pass',
        statusCode: 200,
        timestamp: new Date().toISOString(),
      });
    });
  });

  describe('Example: Error Handling Contract', () => {
    it('should handle various error scenarios correctly', async () => {
      // Test 400 Bad Request
      const badRequestInteraction = createInteraction(
        'Handle bad request with validation errors',
        {
          method: 'POST',
          path: '/api/auth/nonce',
          headers: { 'Content-Type': 'application/json' },
          body: {
            publicKey: 'invalid-key-format',
          },
        },
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: {
            error: {
              code: 'INVALID_INPUT',
              message: 'Invalid public key format',
              status: 400,
              timestamp: new Date().toISOString(),
            },
          },
        }
      );

      await pact.addInteraction(badRequestInteraction);

      const response = await fetch(`${getPactProviderUrl()}/api/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: 'invalid-key-format',
        }),
      });

      expect(response.status).toBe(400);

      reporter.addTestResult('/api/auth/nonce', 'POST', 'Handle bad request', {
        name: 'Handle bad request',
        status: 'pass',
        statusCode: 400,
        timestamp: new Date().toISOString(),
      });
    });
  });

  describe('Example: OpenAPI Spec Coverage', () => {
    it('should verify all OpenAPI paths are documented', async () => {
      const paths = await getOpenAPIPaths();

      expect(paths.length).toBeGreaterThan(0);
      console.log(`✓ Found ${paths.length} API paths in OpenAPI spec`);

      // Sample verification
      const expectedPaths = ['/api/health', '/api/auth/nonce', '/api/auth/verify', '/api/trees'];
      for (const path of expectedPaths) {
        expect(paths).toContain(path);
      }
    });

    it('should verify operations for key paths', async () => {
      const healthOps = await getPathOperations('/api/health');
      expect(healthOps.length).toBeGreaterThan(0);
      expect(healthOps.map((op) => op.method)).toContain('GET');

      const authOps = await getPathOperations('/api/auth/nonce');
      expect(authOps.map((op) => op.method)).toContain('POST');
    });
  });
});
