import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getTreeList, getTreeById } = vi.hoisted(() => ({
  getTreeList: vi.fn(),
  getTreeById: vi.fn(),
}));
const { getPlanterProfiles } = vi.hoisted(() => ({
  getPlanterProfiles: vi.fn(),
}));

vi.mock('@/lib/api/tree-registry', () => ({ getTreeList, getTreeById }));
vi.mock('@/lib/api/planters', () => ({ getPlanterProfiles }));
vi.mock('@/lib/db/client', () => ({ getPool: vi.fn() }));

import { executeGraphQLRequest } from '../route';

const tree = {
  id: 'tree-001',
  treeId: 'HRV-2024-0001',
  species: 'Teak',
  region: 'Kano, Nigeria',
  status: 'verified',
  plantedAt: '2024-03-12T08:00:00Z',
  lat: 12.04,
  lng: 8.48,
  co2OffsetKgPerYear: 48,
  projectName: 'Northern Savanna Reforestation',
};

const planter = {
  id: 'ada-okafor',
  name: 'Ada Okafor',
  photo: 'https://example.com/ada.jpg',
  region: 'Kaduna, Nigeria',
  reputationScore: 94,
  totalTreesPlanted: 184,
  completedJobs: [],
  about: 'Community restoration coordinator.',
};

function post(query: string, variables?: Record<string, unknown>) {
  return executeGraphQLRequest(
    new NextRequest('http://localhost/api/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
  );
}

describe('Apollo GraphQL API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTreeList.mockResolvedValue({ trees: [tree] });
    getTreeById.mockResolvedValue(tree);
    getPlanterProfiles.mockReturnValue([planter]);
  });

  it('serves introspection through the Apollo endpoint', async () => {
    const response = await post('{ __schema { queryType { name } } }');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.__schema.queryType.name).toBe('Query');
  });

  it('returns filtered tree fields and forwards pagination arguments', async () => {
    const response = await post(
      `query Trees($region: String, $limit: Int, $offset: Int) {
        trees(region: $region, limit: $limit, offset: $offset) {
          id treeRef species latitude longitude
        }
      }`,
      { region: 'Kano, Nigeria', limit: 10, offset: 2 }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.data.trees).toEqual([
      {
        id: 'tree-001',
        treeRef: 'HRV-2024-0001',
        species: 'Teak',
        latitude: 12.04,
        longitude: 8.48,
      },
    ]);
    expect(getTreeList).toHaveBeenCalledWith({
      region: 'Kano, Nigeria',
      species: undefined,
      status: undefined,
      search: undefined,
      limit: 10,
      offset: 2,
    });
  });

  it('returns a single tree and paginated planters', async () => {
    const response = await post(`{
      tree(id: "tree-001") { treeRef status }
      planters(limit: 1) { id name reputationScore }
      planter(id: "ada-okafor") { name totalTreesPlanted }
    }`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.tree).toEqual({ treeRef: 'HRV-2024-0001', status: 'verified' });
    expect(body.data.planters).toEqual([
      { id: 'ada-okafor', name: 'Ada Okafor', reputationScore: 94 },
    ]);
    expect(body.data.planter).toEqual({ name: 'Ada Okafor', totalTreesPlanted: 184 });
  });

  it('returns a standard GraphQL validation error for unknown fields', async () => {
    const response = await post('{ trees { unknownField } }');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.errors[0].message).toContain('Cannot query field "unknownField"');
    expect(getTreeList).not.toHaveBeenCalled();
  });
});
