import { getPool } from '@/lib/db/client';
import { getPlanterProfiles } from '@/lib/api/planters';
import { getTreeById, getTreeList, type TreeListOptions } from '@/lib/api/tree-registry';
import type { Tree } from '@/lib/types/tree';

export interface QueryFilter {
  region?: string;
  species?: string;
}

export interface RegionMetricsResult {
  region: string;
  countryCode: string | null;
  totalTrees: number;
  totalCo2SequestrationKg: number;
  activePlantersCount: number;
}

export interface SpeciesMetricsResult {
  speciesSlug: string;
  speciesName: string | null;
  totalTrees: number;
  totalCo2SequestrationKg: number;
  co2KgPerTreeYear: number;
}

export interface AggregateSequestrationResult {
  totalTrees: number;
  totalCo2SequestrationKg: number;
  totalPlanters: number;
  activeRegionsCount: number;
  speciesCount: number;
  byRegion: RegionMetricsResult[];
  bySpecies: SpeciesMetricsResult[];
}

export interface GraphQLTree {
  id: string;
  treeRef: string;
  species: string;
  region: string;
  status: string;
  plantedAt: string | null;
  latitude: number;
  longitude: number;
  co2OffsetKgPerYear: number;
  projectName: string;
}

export interface GraphQLPlanter {
  id: string;
  name: string;
  photo: string;
  region: string;
  reputationScore: number;
  totalTreesPlanted: number;
}

export interface GraphQLContract {
  id: string;
  name: string;
  network: string;
}

export function mapTree(tree: Tree): GraphQLTree {
  return {
    id: tree.id,
    treeRef: tree.treeId,
    species: tree.species,
    region: tree.region,
    status: tree.status,
    plantedAt: tree.plantedAt ?? null,
    latitude: tree.lat,
    longitude: tree.lng,
    co2OffsetKgPerYear: tree.co2OffsetKgPerYear,
    projectName: tree.projectName,
  };
}

export function listContracts(): GraphQLContract[] {
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
  const configuredContracts: Array<[string, string, string | undefined]> = [
    ['treeEscrow', 'Tree Escrow', process.env.NEXT_PUBLIC_CONTRACT_TREE_ESCROW],
    ['escrowMilestone', 'Escrow Milestone', process.env.NEXT_PUBLIC_CONTRACT_ESCROW_MILESTONE],
    ['locationProof', 'Location Proof', process.env.NEXT_PUBLIC_CONTRACT_LOCATION_PROOF],
    [
      'nullifierRegistry',
      'Nullifier Registry',
      process.env.NEXT_PUBLIC_CONTRACT_NULLIFIER_REGISTRY,
    ],
    ['carbonCredits', 'Carbon Credits', process.env.NEXT_PUBLIC_CONTRACT_CARBON_CREDITS],
  ];

  return configuredContracts
    .filter(([, , id]) => Boolean(id))
    .map(([name, label, id]) => ({ id: id as string, name: label, network }));
}

export const resolvers = {
  Query: {
    trees: async (_parent: unknown, args: TreeListOptions) => {
      const result = await getTreeList({
        region: args.region,
        species: args.species,
        status: args.status,
        search: args.search,
        limit: args.limit,
        offset: args.offset,
      });
      return result.trees.map(mapTree);
    },
    tree: async (_parent: unknown, args: { id: string }) => {
      const tree = await getTreeById(args.id);
      return tree ? mapTree(tree) : null;
    },
    planters: (_parent: unknown, args: { limit?: number; offset?: number }) => {
      const offset = Math.max(args.offset ?? 0, 0);
      const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
      return getPlanterProfiles()
        .slice(offset, offset + limit)
        .map(
          ({ id, name, photo, region, reputationScore, totalTreesPlanted }) =>
            ({
              id,
              name,
              photo,
              region,
              reputationScore,
              totalTreesPlanted,
            }) satisfies GraphQLPlanter
        );
    },
    planter: (_parent: unknown, args: { id: string }) => {
      const profile = getPlanterProfiles().find((candidate) => candidate.id === args.id);
      if (!profile) return null;
      return {
        id: profile.id,
        name: profile.name,
        photo: profile.photo,
        region: profile.region,
        reputationScore: profile.reputationScore,
        totalTreesPlanted: profile.totalTreesPlanted,
      } satisfies GraphQLPlanter;
    },
    contracts: () => listContracts(),
    contract: (_parent: unknown, args: { id: string }) =>
      listContracts().find((contract) => contract.id === args.id) ?? null,
    treeRegistryAnalytics: (_parent: unknown, args: QueryFilter) =>
      resolveTreeRegistryAnalytics(args),
    aggregateMetrics: (_parent: unknown, args: QueryFilter) => resolveTreeRegistryAnalytics(args),
    metricsByRegion: async (_parent: unknown, args: { region?: string }) =>
      (await resolveTreeRegistryAnalytics({ region: args.region })).byRegion,
    metricsBySpecies: async (_parent: unknown, args: { species?: string }) =>
      (await resolveTreeRegistryAnalytics({ species: args.species })).bySpecies,
  },
};

export async function resolveTreeRegistryAnalytics(
  filters: QueryFilter = {}
): Promise<AggregateSequestrationResult> {
  const pool = getPool();

  const whereClauses: string[] = ['t.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters.region) {
    params.push(filters.region);
    whereClauses.push(`t.region = $${params.length}`);
  }

  if (filters.species) {
    params.push(filters.species);
    whereClauses.push(`t.species_slug = $${params.length}`);
  }

  const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
  const summaryQuery = `
    SELECT COUNT(t.id)::int AS total_trees,
           COALESCE(SUM(sc.co2_kg_per_year), 0)::float AS total_co2_kg,
           COUNT(DISTINCT t.planter_id)::int AS total_planters,
           COUNT(DISTINCT t.region)::int AS active_regions_count,
           COUNT(DISTINCT t.species_slug)::int AS species_count
    FROM trees t
    LEFT JOIN species_catalogue sc ON t.species_slug = sc.species_slug
    ${whereSql};
  `;
  const regionQuery = `
    SELECT t.region, MAX(t.country_code) AS country_code,
           COUNT(t.id)::int AS total_trees,
           COALESCE(SUM(sc.co2_kg_per_year), 0)::float AS total_co2_kg,
           COUNT(DISTINCT t.planter_id)::int AS active_planters
    FROM trees t
    LEFT JOIN species_catalogue sc ON t.species_slug = sc.species_slug
    ${whereSql}
    GROUP BY t.region ORDER BY total_co2_kg DESC;
  `;
  const speciesQuery = `
    SELECT t.species_slug, MAX(sc.name) AS species_name,
           COUNT(t.id)::int AS total_trees,
           COALESCE(SUM(sc.co2_kg_per_year), 0)::float AS total_co2_kg,
           COALESCE(MAX(sc.co2_kg_per_year), 25.0)::float AS co2_per_tree_year
    FROM trees t
    LEFT JOIN species_catalogue sc ON t.species_slug = sc.species_slug
    ${whereSql}
    GROUP BY t.species_slug ORDER BY total_co2_kg DESC;
  `;

  const [summaryRes, regionRes, speciesRes] = await Promise.all([
    pool.query(summaryQuery, params),
    pool.query(regionQuery, params),
    pool.query(speciesQuery, params),
  ]);
  const summary = summaryRes.rows[0] ?? {};

  return {
    totalTrees: summary.total_trees ?? 0,
    totalCo2SequestrationKg: summary.total_co2_kg ?? 0,
    totalPlanters: summary.total_planters ?? 0,
    activeRegionsCount: summary.active_regions_count ?? 0,
    speciesCount: summary.species_count ?? 0,
    byRegion: regionRes.rows.map((row) => ({
      region: row.region || 'Unknown',
      countryCode: row.country_code || null,
      totalTrees: row.total_trees ?? 0,
      totalCo2SequestrationKg: row.total_co2_kg ?? 0,
      activePlantersCount: row.active_planters ?? 0,
    })),
    bySpecies: speciesRes.rows.map((row) => ({
      speciesSlug: row.species_slug || 'unspecified',
      speciesName: row.species_name || null,
      totalTrees: row.total_trees ?? 0,
      totalCo2SequestrationKg: row.total_co2_kg ?? 0,
      co2KgPerTreeYear: row.co2_per_tree_year ?? 0,
    })),
  };
}
