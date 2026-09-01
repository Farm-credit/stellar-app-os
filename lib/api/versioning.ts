export const API_V1_DEPRECATION = 'Sunset=Wed, 30 Jun 2027 00:00:00 GMT';

export function apiVersionHeaders(version: 'v1' | 'v2', deprecated = false): HeadersInit {
  const headers: Record<string, string> = {
    'X-API-Version': version,
    'Vary': 'Accept, X-API-Version',
  };
  if (deprecated) {
    headers.Deprecation = 'true';
    headers.Sunset = 'Wed, 30 Jun 2027 00:00:00 GMT';
    headers.Link = '</api/v2/impact>; rel="successor-version"';
  }
  return headers;
}

export function readStatus(url: URL): string | null {
  return url.searchParams.get('status') ?? url.searchParams.get('state');
}
