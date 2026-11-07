import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, z } from 'zod';
import { getPool } from '@/lib/db/client';
import { ForumError, forumPostIdSchema, toggleForumVote } from '@/lib/sponsor-forum';
import { isValidTeamWallet } from '@/lib/team-forest';

export const runtime = 'nodejs';

const voteSchema = z.object({
  wallet: z.string().trim().refine(isValidTeamWallet, 'A valid Stellar wallet is required'),
});

type RouteContext = { params: Promise<{ postId: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { postId } = await context.params;
    const id = forumPostIdSchema.parse(postId);
    const { wallet } = voteSchema.parse(await request.json());
    return NextResponse.json(await toggleForumVote(getPool(), id, wallet));
  } catch (error) {
    if (error instanceof ForumError || error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: error instanceof ForumError ? error.message : 'Please check the submitted fields',
        },
        { status: error instanceof ForumError ? error.status : 400 }
      );
    }
    console.error('[sponsor-forum] vote failed', error);
    return NextResponse.json({ error: 'Unable to update your vote' }, { status: 500 });
  }
}
