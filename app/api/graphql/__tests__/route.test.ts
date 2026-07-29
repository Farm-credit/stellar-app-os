import { describe, it, expect, vi } from 'vitest';
import { typeDefs } from '@/lib/graphql/schema';

describe('GraphQL Gateway Schema & Query Extractor', () => {
  it('contains expected GraphQL type definitions', () => {
    expect(typeDefs).toContain('type RegionMetrics');
    expect(typeDefs).toContain('type SpeciesMetrics');
    expect(typeDefs).toContain('type AggregateSequestration');
    expect(typeDefs).toContain('treeRegistryAnalytics');
  });
});
