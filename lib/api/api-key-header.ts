/** Resolve both supported API-key headers consistently in the proxy and routes. */
export function readApiKey(request: Pick<Request, 'headers'>): string | null {
  // An explicitly supplied X-API-Key takes precedence, including an empty one.
  const headerKey = request.headers.get('x-api-key');
  if (headerKey !== null) return headerKey.trim() || null;

  const authorization = request.headers.get('authorization');
  const match = authorization && /^ApiKey\s+(\S+)$/i.exec(authorization.trim());
  return match ? match[1] : null;
}
