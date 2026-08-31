import { ApolloServer } from '@apollo/server';
import { HeaderMap } from '@apollo/server';
import { type NextRequest } from 'next/server';
import { resolvers } from '@/lib/graphql/resolvers';
import { typeDefs } from '@/lib/graphql/schema';

export const runtime = 'nodejs';

const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,
});

// Apollo Server is a long-lived module singleton in the Next.js server runtime.
// Starting it once avoids a startup race when several clients hit the route.
const serverStarted = apolloServer.start();

export async function executeGraphQLRequest(request: NextRequest): Promise<Response> {
  await serverStarted;

  const httpGraphQLRequest = {
    method: request.method,
    headers: new HeaderMap(request.headers.entries()),
    search: new URL(request.url).search,
    body: request.method === 'GET' ? undefined : await request.json(),
  } as const;

  const response = await apolloServer.executeHTTPGraphQLRequest({
    httpGraphQLRequest,
    context: () => ({ request }),
  });

  const headers = new Headers();
  response.headers.forEach((value, key) => headers.set(key, value));

  if (response.body.kind !== 'complete') {
    return new Response('Streaming GraphQL responses are not supported by this route.', {
      status: 501,
      headers,
    });
  }

  return new Response(response.body.string, {
    status: response.status ?? 200,
    headers,
  });
}

export function POST(request: NextRequest) {
  return executeGraphQLRequest(request);
}

export function GET(request: NextRequest) {
  return executeGraphQLRequest(request);
}
