import { NextRequest, NextResponse } from 'next/server';
import { resolveTreeRegistryAnalytics, QueryFilter } from '@/lib/graphql/resolvers';
import { typeDefs } from '@/lib/graphql/schema';

interface GraphQLRequestBody {
  query?: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: GraphQLRequestBody = await req.json();
    const { query, variables } = body;

    if (!query) {
      return NextResponse.json(
        { errors: [{ message: 'Must provide query string.' }] },
        { status: 400 }
      );
    }

    // Introspection query support
    if (query.includes('__schema') || query.includes('__type')) {
      return NextResponse.json({
        data: {
          __schema: {
            queryType: { name: 'Query' },
            types: [
              { name: 'Query' },
              { name: 'AggregateSequestration' },
              { name: 'RegionMetrics' },
              { name: 'SpeciesMetrics' },
            ],
          },
        },
      });
    }

    // Extract filters from query or variables
    const region = (variables?.region as string) || extractQueryParam(query, 'region');
    const species = (variables?.species as string) || extractQueryParam(query, 'species');

    const filters: QueryFilter = {};
    if (region) filters.region = region;
    if (species) filters.species = species;

    const analyticsData = await resolveTreeRegistryAnalytics(filters);

    if (query.includes('metricsByRegion')) {
      return NextResponse.json({
        data: {
          metricsByRegion: analyticsData.byRegion,
        },
      });
    }

    if (query.includes('metricsBySpecies')) {
      return NextResponse.json({
        data: {
          metricsBySpecies: analyticsData.bySpecies,
        },
      });
    }

    return NextResponse.json({
      data: {
        treeRegistryAnalytics: analyticsData,
        aggregateMetrics: analyticsData,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[GraphQL API] Handler error:', err);
    return NextResponse.json(
      { errors: [{ message: errorMsg }] },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query');
  const region = searchParams.get('region') || undefined;
  const species = searchParams.get('species') || undefined;

  if (query && (query.includes('__schema') || query.includes('__type'))) {
    return NextResponse.json({
      data: {
        typeDefs,
        status: 'GraphQL Tree Registry Analytics Gateway active',
      },
    });
  }

  try {
    const analyticsData = await resolveTreeRegistryAnalytics({ region, species });
    return NextResponse.json({
      data: {
        treeRegistryAnalytics: analyticsData,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { errors: [{ message: errorMsg }] },
      { status: 500 }
    );
  }
}

function extractQueryParam(queryStr: string, paramName: string): string | undefined {
  const regex = new RegExp(`${paramName}\\s*:\\s*"([^"]+)"`);
  const match = queryStr.match(regex);
  return match ? match[1] : undefined;
}
