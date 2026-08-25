/**
 * GraphQL Schema Definitions for Tree Registry Analytics
 * Issue #833
 */

export const typeDefs = `
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
    treeRegistryAnalytics(region: String, species: String): AggregateSequestration!
    aggregateMetrics(region: String, species: String): AggregateSequestration!
    metricsByRegion(region: String): [RegionMetrics!]!
    metricsBySpecies(species: String): [SpeciesMetrics!]!
  }
`;
