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

    // Tree detail - distance from sponsor's location
    const sponsorLat = variables?.sponsorLat as number | undefined;
    const sponsorLng = variables?.sponsorLng as number | undefined;
    const treeLat = variables?.treeLat as number | undefined;
    const treeLng = variables?.treeLng as number | undefined;

    if (query.includes('treeDetail') && sponsorLat !== undefined && sponsorLng !== undefined && treeLat !== undefined && treeLng !== undefined) {
      const distance = calculateDistance(sponsorLat, sponsorLng, treeLat, treeLng);
      return NextResponse.json({
        data: {
          treeDetail: {
            distanceKm: distance,
          },
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

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}
