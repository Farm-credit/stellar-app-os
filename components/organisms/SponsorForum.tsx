'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowBigUp,
  CalendarDays,
  CircleHelp,
  Leaf,
  Megaphone,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useWalletContext } from '@/contexts/WalletContext';
import {
  type ForumCategory,
  type ForumPost,
  FORUM_CATEGORIES,
  FORUM_CATEGORY_LABELS,
} from '@/lib/sponsor-forum/shared';

const CATEGORY_ICONS = {
  'species-talk': Leaf,
  'volunteer-meetups': CalendarDays,
  'conservation-news': Megaphone,
  'platform-help': CircleHelp,
} satisfies Record<ForumCategory, typeof Leaf>;

interface ForumResponse {
  posts: ForumPost[];
  canModerate: boolean;
}

const panelClass =
  'rounded-2xl border border-border bg-card shadow-sm shadow-slate-900/5 dark:shadow-black/10';

function shortWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function relativeDate(date: string): string {
  const elapsed = Date.now() - new Date(date).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'Just now';
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function SponsorForum() {
  const { wallet } = useWalletContext();
  const walletAddress = wallet?.publicKey ?? null;
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [category, setCategory] = useState<ForumCategory | 'all'>('all');
  const [sort, setSort] = useState<'newest' | 'top'>('newest');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [canModerate, setCanModerate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showComposer, setShowComposer] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [postCategory, setPostCategory] = useState<ForumCategory>('species-talk');
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadPosts() {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ sort });
      if (category !== 'all') params.set('category', category);
      if (tagFilter) params.set('tag', tagFilter);
      if (walletAddress) params.set('wallet', walletAddress);
      try {
        const response = await fetch(`/api/community/forum/posts?${params}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const result = (await response.json()) as ForumResponse & { error?: string };
        if (!response.ok) throw new Error(result.error ?? 'Unable to load the forum');
        setPosts(result.posts);
        setCanModerate(result.canModerate);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : 'Unable to load the forum');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadPosts();
    return () => controller.abort();
  }, [category, refreshKey, sort, tagFilter, walletAddress]);

  const visiblePosts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return posts;
    return posts.filter((post) =>
      [post.title, post.body, ...post.tags, post.authorWallet].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [posts, search]);

  async function refreshPosts() {
    const params = new URLSearchParams({ sort });
    if (category !== 'all') params.set('category', category);
    if (tagFilter) params.set('tag', tagFilter);
    if (walletAddress) params.set('wallet', walletAddress);
    const response = await fetch(`/api/community/forum/posts?${params}`, { cache: 'no-store' });
    const result = (await response.json()) as ForumResponse & { error?: string };
    if (!response.ok) throw new Error(result.error ?? 'Unable to refresh the forum');
    setPosts(result.posts);
    setCanModerate(result.canModerate);
  }

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!walletAddress) return;
    setSaving(true);
    setError(null);
    try {
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim().toLowerCase().replace(/^#/, ''))
        .filter(Boolean);
      const response = await fetch('/api/community/forum/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, category: postCategory, title, body, tags }),
      });
      const result = (await response.json()) as { post?: ForumPost; error?: string };
      if (!response.ok || !result.post)
        throw new Error(result.error ?? 'Unable to publish your post');
      setTitle('');
      setBody('');
      setTagsInput('');
      setCategory('all');
      setTagFilter(null);
      setShowComposer(false);
      setRefreshKey((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to publish your post');
    } finally {
      setSaving(false);
    }
  }

  async function toggleVote(post: ForumPost) {
    if (!walletAddress) {
      setError('Connect your Stellar wallet to vote.');
      return;
    }
    setError(null);
    try {
      const response = await fetch(
        `/api/community/forum/posts/${encodeURIComponent(post.id)}/vote`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ wallet: walletAddress }),
        }
      );
      const result = (await response.json()) as {
        hasVoted?: boolean;
        voteCount?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'Unable to update your vote');
      setPosts((current) =>
        current.map((item) =>
          item.id === post.id
            ? {
                ...item,
                hasVoted: Boolean(result.hasVoted),
                voteCount: result.voteCount ?? item.voteCount,
              }
            : item
        )
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update your vote');
    }
  }

  async function moderate(post: ForumPost) {
    const status = post.status === 'hidden' ? 'published' : 'hidden';
    setError(null);
    try {
      const response = await fetch(`/api/community/forum/posts/${encodeURIComponent(post.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Unable to update this post');
      await refreshPosts();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update this post');
    }
  }

  return (
    <div>
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
            <Leaf className="h-4 w-4" aria-hidden />
            Grow together
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Sponsor community
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Share what you’re growing, find local volunteer opportunities, and learn from fellow
            tree sponsors.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowComposer((current) => !current)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
        >
          {showComposer ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showComposer ? 'Close editor' : 'Start a discussion'}
        </button>
      </header>

      {showComposer && (
        <form onSubmit={submitPost} className={`${panelClass} mb-7 p-5 sm:p-6`}>
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Share with the community</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Be kind, stay on topic, and help keep this a welcoming place for sponsors.
            </p>
          </div>
          {walletAddress ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">
                Discussion title
                <input
                  required
                  minLength={8}
                  maxLength={120}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="What would you like to talk about?"
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-sm font-medium">
                Category
                <select
                  value={postCategory}
                  onChange={(event) => setPostCategory(event.target.value as ForumCategory)}
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                >
                  {FORUM_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {FORUM_CATEGORY_LABELS[item]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Tags <span className="font-normal text-muted-foreground">(comma separated)</span>
                <input
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                  placeholder="mangroves, restoration"
                  className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Your message
                <textarea
                  required
                  minLength={20}
                  maxLength={5000}
                  rows={5}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Share an update, ask a question, or start a conversation..."
                  className="mt-1.5 w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
                <p className="text-xs text-muted-foreground">
                  Posting as {shortWallet(walletAddress)} · up to 5 tags
                </p>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Publishing…' : 'Publish discussion'}
                </button>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              Connect your Stellar wallet using the button in the header to start a discussion.
            </p>
          )}
        </form>
      )}

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss message"
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className={`${panelClass} h-fit p-4`}>
          <h2 className="mb-3 px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Browse categories
          </h2>
          <nav aria-label="Forum categories" className="space-y-1">
            <button
              type="button"
              onClick={() => {
                setCategory('all');
                setTagFilter(null);
              }}
              aria-current={category === 'all' ? 'page' : undefined}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${category === 'all' ? 'bg-emerald-700 text-white' : 'text-foreground hover:bg-muted'}`}
            >
              All discussions
              <MessageCircle className="h-4 w-4" aria-hidden />
            </button>
            {FORUM_CATEGORIES.map((item) => {
              const Icon = CATEGORY_ICONS[item];
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setCategory(item);
                    setTagFilter(null);
                  }}
                  aria-current={category === item ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${category === item ? 'bg-emerald-700 text-white' : 'text-foreground hover:bg-muted'}`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {FORUM_CATEGORY_LABELS[item]}
                </button>
              );
            })}
          </nav>
          <div className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
            <p className="font-semibold">A forest grows through community.</p>
            <p className="mt-1 text-xs leading-relaxed opacity-80">
              Share knowledge, celebrate progress, and make space for every voice.
            </p>
          </div>
        </aside>

        <section aria-label="Forum discussions">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <span className="sr-only">Search discussions</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search discussions and tags"
                className="w-full rounded-xl border border-input bg-card py-2.5 pl-9 pr-3 text-sm"
              />
            </label>
            <label className="sr-only" htmlFor="forum-sort">
              Sort discussions
            </label>
            <select
              id="forum-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as 'newest' | 'top')}
              className="rounded-xl border border-input bg-card px-3 py-2.5 text-sm"
            >
              <option value="newest">Newest first</option>
              <option value="top">Top voted</option>
            </select>
          </div>

          {tagFilter && (
            <button
              type="button"
              onClick={() => setTagFilter(null)}
              className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
            >
              #{tagFilter}
              <X className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Clear tag filter</span>
            </button>
          )}

          {loading ? (
            <div className={`${panelClass} p-8 text-center text-sm text-muted-foreground`}>
              Loading sponsor discussions…
            </div>
          ) : visiblePosts.length === 0 ? (
            <div className={`${panelClass} px-6 py-14 text-center`}>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                <MessageCircle className="h-6 w-6" aria-hidden />
              </div>
              <h2 className="text-lg font-semibold">No discussions yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {search || tagFilter
                  ? 'Try another search or clear your tag filter.'
                  : 'Be the first to start a conversation in this space.'}
              </p>
              {!search && !tagFilter && (
                <button
                  type="button"
                  onClick={() => setShowComposer(true)}
                  className="mt-4 text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
                >
                  Start the first discussion
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {visiblePosts.map((post) => {
                const Icon = CATEGORY_ICONS[post.category];
                return (
                  <article
                    key={post.id}
                    className={`${panelClass} flex gap-4 p-4 sm:gap-5 sm:p-5 ${post.status === 'hidden' ? 'opacity-75' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => void toggleVote(post)}
                      disabled={post.status === 'hidden'}
                      aria-pressed={post.hasVoted}
                      aria-label={`${post.hasVoted ? 'Remove upvote from' : 'Upvote'} ${post.title}, ${post.voteCount} votes`}
                      className={`flex h-fit min-w-[54px] flex-col items-center rounded-xl border px-2 py-2 transition ${post.hasVoted ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-border text-muted-foreground hover:border-emerald-700 hover:text-emerald-700'} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <ArrowBigUp className="h-5 w-5" aria-hidden />
                      <span className="text-sm font-semibold">{post.voteCount}</span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium text-foreground">
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                          {FORUM_CATEGORY_LABELS[post.category]}
                        </span>
                        <span>{shortWallet(post.authorWallet)}</span>
                        <span aria-hidden>·</span>
                        <time dateTime={post.createdAt}>{relativeDate(post.createdAt)}</time>
                        {post.status === 'hidden' && (
                          <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                            Hidden
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold leading-snug text-foreground">
                        {post.title}
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                        {post.body}
                      </p>
                      {post.tags.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {post.tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setTagFilter(tag)}
                              className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {canModerate && (
                      <button
                        type="button"
                        onClick={() => void moderate(post)}
                        aria-label={`${post.status === 'hidden' ? 'Restore' : 'Hide'} post: ${post.title}`}
                        className="flex h-fit items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      >
                        <ShieldCheck className="h-4 w-4" aria-hidden />
                        <span className="hidden sm:inline">
                          {post.status === 'hidden' ? 'Restore' : 'Hide'}
                        </span>
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
