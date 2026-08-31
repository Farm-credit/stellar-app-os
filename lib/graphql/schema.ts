/**
 * GraphQL schema for the FarmCredit public data API.
 *
 * The schema intentionally exposes read-only resources. Mutations are out of
 * scope for issue #1017 so clients can compose tree, planter, and contract
 * queries without changing on-chain or database state.
 */

export const typeDefs = `#graphql
  type Tree {
    id: ID!
    treeRef: String!
    species: String!
    region: String!
    status: String!
    plantedAt: String
    latitude: Float!
    longitude: Float!
    co2OffsetKgPerYear: Float!
    projectName: String!
  }

  type Planter {
    id: ID!
    name: String!
    photo: String!
    region: String!
    reputationScore: Int!
    totalTreesPlanted: Int!
  }

  type Contract {
    id: ID!
    name: String!
    network: String!
  }

  type RegionMetrics {
    region: String!
    countryCode: String
    totalTrees: Int!
    totalCo2SequestrationKg: Float!
    activePlantersCount: Int!
  }

  type SpeciesMetrics {
    speciesSlug: String!
    speciesName: String
    totalTrees: Int!
    totalCo2SequestrationKg: Float!
    co2KgPerTreeYear: Float!
  }

  type AggregateSequestration {
    totalTrees: Int!
    totalCo2SequestrationKg: Float!
    totalPlanters: Int!
    activeRegionsCount: Int!
    speciesCount: Int!
    byRegion: [RegionMetrics!]!
    bySpecies: [SpeciesMetrics!]!
  }

  type Query {
    trees(
      region: String
      species: String
      status: String
      search: String
      limit: Int = 50
      offset: Int = 0
    ): [Tree!]!
    tree(id: ID!): Tree
    planters(limit: Int = 50, offset: Int = 0): [Planter!]!
    planter(id: ID!): Planter
    contracts: [Contract!]!
    contract(id: ID!): Contract
    treeRegistryAnalytics(region: String, species: String): AggregateSequestration!
    aggregateMetrics(region: String, species: String): AggregateSequestration!
    metricsByRegion(region: String): [RegionMetrics!]!
    metricsBySpecies(species: String): [SpeciesMetrics!]!
  }
`;
