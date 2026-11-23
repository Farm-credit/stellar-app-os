import type { Pool } from 'pg';
import { z } from 'zod';
import {
  FORUM_CATEGORIES,
  type ForumCategory,
  type ForumPost,
  type ForumPostStatus,
} from './sponsor-forum/shared';

export { FORUM_CATEGORIES, FORUM_CATEGORY_LABELS } from './sponsor-forum/shared';
export type { ForumCategory, ForumPost, ForumPostStatus } from './sponsor-forum/shared';

export const createForumPostSchema = z.object({
  wallet: z
    .string()
    .trim()
    .regex(/^G[A-Z2-7]{55}$/, 'A valid Stellar wallet is required'),
  category: z.enum(FORUM_CATEGORIES),
  title: z.string().trim().min(8).max(120),
  body: z.string().trim().min(20).max(5000),
  tags: z
    .array(z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,24}$/))
    .max(5)
    .default([])
    .transform((tags) => [...new Set(tags)]),
});

export const forumPostIdSchema = z.uuid();

export type ForumPostInput = z.infer<typeof createForumPostSchema>;

export class ForumError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ForumError';
  }
}

interface ForumPostRow {
  id: string;
  author_wallet: string;
  category: ForumCategory;
  title: string;
  body: string;
  tags: string[];
  status: ForumPostStatus;
  vote_count: number;
  has_voted: boolean;
  created_at: Date;
  moderated_at: Date | null;
}

function mapForumPost(row: ForumPostRow): ForumPost {
  return {
    id: row.id,
    authorWallet: row.author_wallet,
    category: row.category,
    title: row.title,
    body: row.body,
    tags: row.tags,
    status: row.status,
    voteCount: row.vote_count,
    hasVoted: row.has_voted,
    createdAt: row.created_at.toISOString(),
    moderatedAt: row.moderated_at?.toISOString() ?? null,
  };
}

export async function listForumPosts(
  pool: Pool,
  options: {
    wallet: string | null;
    category?: ForumCategory;
    tag?: string;
    sort: 'newest' | 'top';
    includeHidden: boolean;
  }
): Promise<ForumPost[]> {
  const ordering =
    options.sort === 'top' ? 'vote_count DESC, p.created_at DESC' : 'p.created_at DESC';
  const result = await pool.query<ForumPostRow>(
    `SELECT p.id, p.author_wallet, p.category, p.title, p.body, p.tags, p.status,
            p.created_at, p.moderated_at, COUNT(v.post_id)::integer AS vote_count,
            CASE WHEN $4::text IS NULL THEN false ELSE
              EXISTS (
                SELECT 1 FROM sponsor_forum_votes mine
                WHERE mine.post_id = p.id AND mine.wallet = $4
              )
            END AS has_voted
     FROM sponsor_forum_posts p
     LEFT JOIN sponsor_forum_votes v ON v.post_id = p.id
     WHERE ($1::boolean OR p.status = 'published')
       AND ($2::text IS NULL OR p.category = $2)
       AND ($3::text IS NULL OR $3 = ANY(p.tags))
     GROUP BY p.id
     ORDER BY ${ordering}
     LIMIT 100`,
    [options.includeHidden, options.category ?? null, options.tag ?? null, options.wallet]
  );
  return result.rows.map(mapForumPost);
}

export async function createForumPost(pool: Pool, input: ForumPostInput): Promise<ForumPost> {
  const result = await pool.query<ForumPostRow>(
    `INSERT INTO sponsor_forum_posts (author_wallet, category, title, body, tags)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, author_wallet, category, title, body, tags, status, created_at, moderated_at,
               0::integer AS vote_count, false AS has_voted`,
    [input.wallet, input.category, input.title, input.body, input.tags]
  );
  const post = result.rows[0];
  if (!post) throw new ForumError('Unable to create the post', 500);
  return mapForumPost(post);
}

export async function toggleForumVote(
  pool: Pool,
  postId: string,
  wallet: string
): Promise<{ hasVoted: boolean; voteCount: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const post = await client.query<{ status: ForumPostStatus }>(
      'SELECT status FROM sponsor_forum_posts WHERE id = $1 FOR UPDATE',
      [postId]
    );
    if (!post.rows[0]) throw new ForumError('Post not found', 404);
    if (post.rows[0].status !== 'published')
      throw new ForumError('This post is not available for voting', 404);

    const existing = await client.query<{ post_id: string }>(
      'SELECT post_id FROM sponsor_forum_votes WHERE post_id = $1 AND wallet = $2',
      [postId, wallet]
    );
    const hasVoted = existing.rowCount === 0;
    if (hasVoted) {
      await client.query('INSERT INTO sponsor_forum_votes (post_id, wallet) VALUES ($1, $2)', [
        postId,
        wallet,
      ]);
    } else {
      await client.query('DELETE FROM sponsor_forum_votes WHERE post_id = $1 AND wallet = $2', [
        postId,
        wallet,
      ]);
    }

    const count = await client.query<{ vote_count: number }>(
      'SELECT COUNT(*)::integer AS vote_count FROM sponsor_forum_votes WHERE post_id = $1',
      [postId]
    );
    await client.query('COMMIT');
    return { hasVoted, voteCount: count.rows[0]?.vote_count ?? 0 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function moderateForumPost(
  pool: Pool,
  postId: string,
  status: ForumPostStatus
): Promise<void> {
  const result = await pool.query(
    `UPDATE sponsor_forum_posts SET status = $2, moderated_at = NOW()
     WHERE id = $1`,
    [postId, status]
  );
  if (result.rowCount === 0) throw new ForumError('Post not found', 404);
}
