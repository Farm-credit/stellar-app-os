/**
 * Authentication Contract Tests
 *
 * Tests authentication endpoints (nonce generation, signature verification)
 * to ensure they match the OpenAPI specification.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPactProvider, getPactProviderUrl, createInteraction } from '../pact/setup';
import { validateResponse, loadOpenAPISpec } from '../pact/openapi-validator';
import { uuidMatcher, isoDateMatcher, stringMatcher, errorResponseMatcher } from '../pact/matchers';
import fetch from 'node-fetch';

describe('Authentication Contract Tests', () => {
  const pact = createPactProvider();

  beforeAll(async () => {
    await loadOpenAPISpec();
  });

  afterAll(async () => {
    await pact.finalize();
  });

  describe('POST /api/auth/nonce', () => {
    it('should return a nonce for wallet authentication', async () => {
      const response = {
        nonce: 'e1b5f3a9-4c2d-4e6f-9b1a-7c3e5d2f8a4b',
        expiresIn: 300,
        timestamp: new Date().toISOString(),
      };

      const interaction = createInteraction(
        'a POST request to generate authentication nonce',
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
          body: response,
        }
      );

      await pact.addInteraction(interaction);

      const url = `${getPactProviderUrl()}/api/auth/nonce`;
      const result = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: 'GBRPYHIL2CI3WHKSW7TALCQO4UQ2OE6HGRXSGTV2VFKOTMYTWLB4CG',
        }),
      });

      const body = await result.json();

      expect(result.status).toBe(200);
      expect(body).toHaveProperty('nonce');
      expect(body).toHaveProperty('expiresIn');
      expect(body).toHaveProperty('timestamp');
      expect(typeof body.nonce).toBe('string');
      expect(typeof body.expiresIn).toBe('number');
    });

    it('should return 400 for invalid public key', async () => {
      const response = {
        error: {
          code: 'INVALID_PUBLIC_KEY',
          message: 'Invalid Stellar public key format',
          status: 400,
          timestamp: new Date().toISOString(),
        },
      };

      const interaction = createInteraction(
        'a POST request with invalid public key',
        {
          method: 'POST',
          path: '/api/auth/nonce',
          headers: { 'Content-Type': 'application/json' },
          body: {
            publicKey: 'invalid-key',
          },
        },
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: response,
        }
      );

      await pact.addInteraction(interaction);

      const url = `${getPactProviderUrl()}/api/auth/nonce`;
      const result = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: 'invalid-key',
        }),
      });

      expect(result.status).toBe(400);
    });
  });

  describe('POST /api/auth/verify', () => {
    it('should verify wallet signature and return auth token', async () => {
      const response = {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expiresIn: 86400,
        user: {
          publicKey: 'GBRPYHIL2CI3WHKSW7TALCQO4UQ2OE6HGRXSGTV2VFKOTMYTWLB4CG',
          email: null,
          createdAt: new Date().toISOString(),
        },
      };

      const interaction = createInteraction(
        'a POST request to verify signed message',
        {
          method: 'POST',
          path: '/api/auth/verify',
          headers: { 'Content-Type': 'application/json' },
          body: {
            publicKey: 'GBRPYHIL2CI3WHKSW7TALCQO4UQ2OE6HGRXSGTV2VFKOTMYTWLB4CG',
            signature: 'signature_base64_encoded',
            nonce: 'e1b5f3a9-4c2d-4e6f-9b1a-7c3e5d2f8a4b',
          },
        },
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: response,
        }
      );

      await pact.addInteraction(interaction);

      const url = `${getPactProviderUrl()}/api/auth/verify`;
      const result = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: 'GBRPYHIL2CI3WHKSW7TALCQO4UQ2OE6HGRXSGTV2VFKOTMYTWLB4CG',
          signature: 'signature_base64_encoded',
          nonce: 'e1b5f3a9-4c2d-4e6f-9b1a-7c3e5d2f8a4b',
        }),
      });

      const body = await result.json();

      expect(result.status).toBe(200);
      expect(body).toHaveProperty('token');
      expect(body).toHaveProperty('expiresIn');
      expect(body).toHaveProperty('user');
      expect(body.user).toHaveProperty('publicKey');
      expect(body.user).toHaveProperty('createdAt');
    });

    it('should return 401 for invalid signature', async () => {
      const response = {
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Signature verification failed',
          status: 401,
          timestamp: new Date().toISOString(),
        },
      };

      const interaction = createInteraction(
        'a POST request with invalid signature',
        {
          method: 'POST',
          path: '/api/auth/verify',
          headers: { 'Content-Type': 'application/json' },
          body: {
            publicKey: 'GBRPYHIL2CI3WHKSW7TALCQO4UQ2OE6HGRXSGTV2VFKOTMYTWLB4CG',
            signature: 'invalid_signature',
            nonce: 'e1b5f3a9-4c2d-4e6f-9b1a-7c3e5d2f8a4b',
          },
        },
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
          body: response,
        }
      );

      await pact.addInteraction(interaction);

      const url = `${getPactProviderUrl()}/api/auth/verify`;
      const result = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: 'GBRPYHIL2CI3WHKSW7TALCQO4UQ2OE6HGRXSGTV2VFKOTMYTWLB4CG',
          signature: 'invalid_signature',
          nonce: 'e1b5f3a9-4c2d-4e6f-9b1a-7c3e5d2f8a4b',
        }),
      });

      const body = await result.json();

      expect(result.status).toBe(401);
      expect(body.error).toHaveProperty('code');
      expect(body.error.code).toBe('INVALID_SIGNATURE');
    });
  });

  describe('OpenAPI Compliance', () => {
    it('should have auth/nonce endpoint defined', async () => {
      const spec = await loadOpenAPISpec();
      expect(spec.paths).toHaveProperty('/api/auth/nonce');
      expect(spec.paths['/api/auth/nonce']).toHaveProperty('post');
    });

    it('should have auth/verify endpoint defined', async () => {
      const spec = await loadOpenAPISpec();
      expect(spec.paths).toHaveProperty('/api/auth/verify');
      expect(spec.paths['/api/auth/verify']).toHaveProperty('post');
    });

    it('should document nonce response structure', async () => {
      const spec = await loadOpenAPISpec();
      const nonceResponse = spec.paths['/api/auth/nonce'].post.responses['200'];
      const schema = nonceResponse.content['application/json'].schema;

      expect(schema.properties).toHaveProperty('nonce');
      expect(schema.properties).toHaveProperty('expiresIn');
      expect(schema.properties).toHaveProperty('timestamp');
    });

    it('should document verify response with user object', async () => {
      const spec = await loadOpenAPISpec();
      const verifyResponse = spec.paths['/api/auth/verify'].post.responses['200'];
      const schema = verifyResponse.content['application/json'].schema;

      expect(schema.properties).toHaveProperty('token');
      expect(schema.properties).toHaveProperty('user');
      expect(schema.properties.user.properties).toHaveProperty('publicKey');
    });
  });
});
