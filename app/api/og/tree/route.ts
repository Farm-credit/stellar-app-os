/**
 * GET /api/og/tree?id=<treeId>
 *
 * Fallback OpenGraph image endpoint for non-Next.js consumers (e.g. email
 * clients, third-party social preview tools, Telegram link previews).
 *
 * Delegates rendering to the file-based OG image route so there is a single
 * source of truth for the image design.
 *
 * Query parameters:
 *   id — tree id or treeId  (required)
 *
 * Responses:
 *   302  Redirect to the canonical Next.js OG image URL
 *   400  { error: "id is required" }
 *
 * Closes #1109
 */

import { NextResponse } from 'next/server';

export const runtime = 'edge';

export function GET(request: Request): NextResponse {
  const url = new URL(request.url);
  const id = url.searchParams.get('id')?.trim();

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // Redirect to the canonical Next.js file-based OG image route.
  // The file-based route handles fetching tree data and rendering.
  const imageUrl = `${url.origin}/trees/${encodeURIComponent(id)}/opengraph-image`;

  return NextResponse.redirect(imageUrl, { status: 302 });
}
