import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { isAdminRequest } from '@/lib/auth/admin';
import { getPool } from '@/lib/db/client';
import {
  createForumPost,
  createForumPostSchema,
  FORUM_CATEGORIES,
  ForumError,
  listForumPosts,
} from '@/lib/sponsor-forum';
import { isValidTeamWallet } from '@/lib/team-forest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function forumResponse(error: unknown): NextResponse {
  if (error instanceof ForumError || error instanceof ZodError || error instanceof SyntaxError) {
    return NextResponse.json(
      { error: error instanceof ForumError ? error.message : 'Please check the submitted fields' },
      { status: error instanceof ForumError ? error.status : 400 }
    );
  }
  console.error('[sponsor-forum] request failed', error);
  return NextResponse.json({ error: 'Unable to complete the request' }, { status: 500 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl;
    const category = searchParams.get('category') ?? undefined;
    const tag = searchParams.get('tag')?.trim().toLowerCase() || undefined;
    const wallet = searchParams.get('wallet')?.trim() || null;
    const sort = searchParams.get('sort') === 'top' ? 'top' : 'newest';
    if (category && !FORUM_CATEGORIES.includes(category as (typeof FORUM_CATEGORIES)[number])) {
      return NextResponse.json({ error: 'Unknown forum category' }, { status: 400 });
    }
    if (tag && !/^[a-z0-9-]{1,24}$/.test(tag)) {
      return NextResponse.json({ error: 'Invalid tag' }, { status: 400 });
    }
    if (wallet && !isValidTeamWallet(wallet)) {
      return NextResponse.json({ error: 'Invalid wallet' }, { status: 400 });
    }
    const canModerate = await isAdminRequest();
    const posts = await listForumPosts(getPool(), {
      wallet,
      category: category as (typeof FORUM_CATEGORIES)[number] | undefined,
      tag,
      sort,
      includeHidden: canModerate,
    });
    return NextResponse.json(
      { posts, canModerate },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return forumResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const input = createForumPostSchema.parse(await request.json());
    const post = await createForumPost(getPool(), input);
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    return forumResponse(error);
  }
}
