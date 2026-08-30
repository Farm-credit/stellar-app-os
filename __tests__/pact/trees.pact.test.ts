/**
 * Trees Contract Tests
 *
 * Tests the tree inventory and tree data endpoints to ensure they match
 * the OpenAPI specification.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPactProvider, getPactProviderUrl, createInteraction } from '../pact/setup';
import { validateResponse, loadOpenAPISpec } from '../pact/openapi-validator';
import { uuidMatcher, isoDateMatcher, paginationMatcher } from '../pact/matchers';
import fetch from 'node-fetch';

describe('Trees Contract Tests', () => {
  const pact = createPactProvider();

  beforeAll(async () => {
    await loadOpenAPISpec();
  });

  afterAll(async () => {
    await pact.finalize();
  });

  describe('GET /api/trees', () => {
    it('should return paginated list of trees', async () => {
      const response = {
        data: [
          {
            id: 'tree-123',
            species: 'Acacia',
            status: 'alive',
            location: {
              latitude: 0.3456,
              longitude: 35.1234,
            },
            plantedAt: new Date().toISOString(),
            height: 2.5,
            diameter: 0.15,
          },
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 1,
          hasMore: false,
        },
      };

      const interaction = createInteraction(
        'a GET request to retrieve list of trees',
        {
          method: 'GET',
          path: '/api/trees',
          query: { page: '1', pageSize: '10' },
        },
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: response,
        }
      );

      await pact.addInteraction(interaction);

      const url = `${getPactProviderUrl()}/api/trees?page=1&pageSize=10`;
      const result = await fetch(url, { method: 'GET' });
      const body = await result.json();

      expect(result.status).toBe(200);
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body).toHaveProperty('pagination');
      expect(body.pagination).toHaveProperty('page');
      expect(body.pagination).toHaveProperty('total');
    });

    it('should filter trees by species', async () => {
      const response = {
        data: [
          {
            id: 'tree-456',
            species: 'Mahogany',
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
      };

      const interaction = createInteraction(
        'a GET request to filter trees by species',
        {
          method: 'GET',
          path: '/api/trees',
          query: { species: 'Mahogany' },
        },
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: response,
        }
      );

      await pact.addInteraction(interaction);

      const url = `${getPactProviderUrl()}/api/trees?species=Mahogany`;
      const result = await fetch(url, { method: 'GET' });
      const body = await result.json();

      expect(result.status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].species).toBe('Mahogany');
    });
  });

  describe('GET /api/trees/{id}', () => {
    it('should return detailed tree information', async () => {
      const treeId = 'tree-123';
      const response = {
        id: treeId,
        species: 'Acacia',
        status: 'alive',
        location: {
          latitude: 0.3456,
          longitude: 35.1234,
          region: 'Kenya',
          coordinates: 'POINT(35.1234 0.3456)',
        },
        plantedAt: new Date().toISOString(),
        height: 2.5,
        diameter: 0.15,
        photos: [
          {
            id: 'photo-1',
            url: 'https://example.com/photo.jpg',
            uploadedAt: new Date().toISOString(),
          },
        ],
        survivalRate: 0.95,
        carbonSequestered: 12.5,
        metadata: {
          planter: 'planter-123',
          batch: 'batch-456',
        },
      };

      const interaction = createInteraction(
        'a GET request to retrieve tree details',
        {
          method: 'GET',
          path: `/api/trees/${treeId}`,
        },
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: response,
        }
      );

      await pact.addInteraction(interaction);

      const url = `${getPactProviderUrl()}/api/trees/${treeId}`;
      const result = await fetch(url, { method: 'GET' });
      const body = await result.json();

      expect(result.status).toBe(200);
      expect(body.id).toBe(treeId);
      expect(body).toHaveProperty('species');
      expect(body).toHaveProperty('location');
      expect(body.location).toHaveProperty('latitude');
      expect(body.location).toHaveProperty('longitude');
    });

    it('should return 404 for non-existent tree', async () => {
      const treeId = 'nonexistent-tree';
      const response = {
        error: {
          code: 'TREE_NOT_FOUND',
          message: 'Tree not found',
          status: 404,
          timestamp: new Date().toISOString(),
        },
      };

      const interaction = createInteraction(
        'a GET request for non-existent tree',
        {
          method: 'GET',
          path: `/api/trees/${treeId}`,
        },
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
          body: response,
        }
      );

      await pact.addInteraction(interaction);

      const url = `${getPactProviderUrl()}/api/trees/${treeId}`;
      const result = await fetch(url, { method: 'GET' });

      expect(result.status).toBe(404);
    });
  });

  describe('GET /api/trees/status/{status}', () => {
    it('should filter trees by status', async () => {
      const response = {
        data: [
          {
            id: 'tree-789',
            species: 'Cedar',
            status: 'dead',
            location: {
              latitude: 0.5678,
              longitude: 35.9012,
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
      };

      const interaction = createInteraction(
        'a GET request to filter trees by status',
        {
          method: 'GET',
          path: '/api/trees/status/dead',
        },
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: response,
        }
      );

      await pact.addInteraction(interaction);

      const url = `${getPactProviderUrl()}/api/trees/status/dead`;
      const result = await fetch(url, { method: 'GET' });
      const body = await result.json();

      expect(result.status).toBe(200);
      expect(body.data[0].status).toBe('dead');
    });
  });

  describe('OpenAPI Compliance', () => {
    it('should have /api/trees endpoint defined', async () => {
      const spec = await loadOpenAPISpec();
      expect(spec.paths).toHaveProperty('/api/trees');
      expect(spec.paths['/api/trees']).toHaveProperty('get');
    });

    it('should have /api/trees/{id} endpoint defined', async () => {
      const spec = await loadOpenAPISpec();
      expect(spec.paths).toHaveProperty('/api/trees/{id}');
      expect(spec.paths['/api/trees/{id}']).toHaveProperty('get');
    });

    it('should document tree list response with pagination', async () => {
      const spec = await loadOpenAPISpec();
      const listResponse = spec.paths['/api/trees'].get.responses['200'];
      const schema = listResponse.content['application/json'].schema;

      expect(schema.properties).toHaveProperty('data');
      expect(schema.properties).toHaveProperty('pagination');
      expect(schema.properties.data.type).toBe('array');
    });

    it('should document required tree properties', async () => {
      const spec = await loadOpenAPISpec();
      const treeSchema = spec.paths['/api/trees'].get.responses['200'].content['application/json'].schema.properties.data.items;

      expect(treeSchema.properties).toHaveProperty('id');
      expect(treeSchema.properties).toHaveProperty('species');
      expect(treeSchema.properties).toHaveProperty('status');
      expect(treeSchema.properties).toHaveProperty('location');
      expect(treeSchema.properties).toHaveProperty('plantedAt');
    });
  });
});
