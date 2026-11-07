import { describe, expect, it, vi } from 'vitest';
import {
  createForumPostSchema,
  ForumError,
  moderateForumPost,
  toggleForumVote,
} from '@/lib/sponsor-forum';

const wallet = `G${'A'.repeat(55)}`;
const postId = '9b5f2080-22ed-4f0a-b75b-a4658587509e';

describe('sponsor forum validation', () => {
  it('normalizes and de-duplicates tags for valid posts', () => {
    const post = createForumPostSchema.parse({
      wallet,
      category: 'species-talk',
      title: 'How are your mangroves growing?',
      body: 'I would love to hear how the mangroves are doing in your region.',
      tags: ['Mangroves', ' restoration ', 'mangroves'],
    });

    expect(post.tags).toEqual(['mangroves', 'restoration']);
  });

  it('rejects malformed tags and invalid sponsor wallets', () => {
    const input = {
      wallet,
      category: 'platform-help',
      title: 'Need help with my account',
      body: 'I cannot see the latest update for the trees I sponsored.',
      tags: ['not a valid tag'],
    };
    expect(createForumPostSchema.safeParse(input).success).toBe(false);
    expect(
      createForumPostSchema.safeParse({ ...input, wallet: 'not-a-wallet', tags: [] }).success
    ).toBe(false);
  });
});

describe('sponsor forum operations', () => {
  it('adds an upvote and returns the new count transactionally', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ status: 'published' }] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ vote_count: 1 }] })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    await expect(toggleForumVote(pool as never, postId, wallet)).resolves.toEqual({
      hasVoted: true,
      voteCount: 1,
    });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rejects voting on a hidden post and rolls back', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ status: 'hidden' }] })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    await expect(toggleForumVote(pool as never, postId, wallet)).rejects.toThrow(
      'This post is not available for voting'
    );
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('reports missing posts during moderation', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) };

    await expect(moderateForumPost(pool as never, postId, 'hidden')).rejects.toBeInstanceOf(
      ForumError
    );
  });
});
