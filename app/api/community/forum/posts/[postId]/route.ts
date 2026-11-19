import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, z } from 'zod';
import { isAdminRequest } from '@/lib/auth/admin';
import { getPool } from '@/lib/db/client';
import { ForumError, forumPostIdSchema, moderateForumPost } from '@/lib/sponsor-forum';

export const runtime = 'nodejs';

const moderationSchema = z.object({ status: z.enum(['published', 'hidden']) });
type RouteContext = { params: Promise<{ postId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { postId } = await context.params;
    const id = forumPostIdSchema.parse(postId);
    const { status } = moderationSchema.parse(await request.json());
    await moderateForumPost(getPool(), id, status);
    return NextResponse.json({ status });
  } catch (error) {
    if (error instanceof ForumError || error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: error instanceof ForumError ? error.message : 'Please check the submitted fields' },
        { status: error instanceof ForumError ? error.status : 400 }
      );
    }
    console.error('[sponsor-forum] moderation failed', error);
    return NextResponse.json({ error: 'Unable to moderate this post' }, { status: 500 });
  }
}
