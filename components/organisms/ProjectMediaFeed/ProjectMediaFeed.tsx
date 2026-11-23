'use client';

/**
 * Project Media Feed - Issue #1820
 *
 * Lightbox gallery of dated verifier photos, drone footage and satellite
 * captures for a sponsored project, newest first.
 */

import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, KeyboardEvent, ReactNode } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ShieldCheck, Video } from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Skeleton } from '@/components/atoms/Skeleton';
import { Text } from '@/components/atoms/Text';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  ProjectMediaItem,
  ProjectMediaKind,
  ProjectMediaLoader,
} from '@/lib/types/project-media';

export const KIND_LABELS: Record<ProjectMediaKind, string> = {
  photo: 'Verifier photo',
  drone: 'Drone',
  satellite: 'Satellite',
};

type KindFilter = ProjectMediaKind | 'all';

interface ProjectMediaFeedProps {
  projectId: string;
  /** Media supplied by the caller. When set, `loadMedia` is not called. */
  items?: ProjectMediaItem[];
  /** Fetches media for the project when `items` is not supplied. */
  loadMedia?: ProjectMediaLoader;
  className?: string;
}

export function formatCaptureDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Date unknown';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function sortNewestFirst(items: ProjectMediaItem[]): ProjectMediaItem[] {
  return [...items].sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
}

type FeedState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: ProjectMediaItem[] };

function ProjectMediaFeedContent({
  projectId,
  items,
  loadMedia,
  className,
}: ProjectMediaFeedProps): ReactNode {
  const [state, setState] = useState<FeedState>(
    items ? { status: 'ready', items: sortNewestFirst(items) } : { status: 'loading' }
  );
  const [filter, setFilter] = useState<KindFilter>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lastTrigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (items) {
      setState({ status: 'ready', items: sortNewestFirst(items) });
      return;
    }
    if (!loadMedia) {
      setState({ status: 'ready', items: [] });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    loadMedia(projectId, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setState({ status: 'ready', items: sortNewestFirst(loaded) });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Unable to load project media.',
        });
      });
    return () => controller.abort();
  }, [projectId, items, loadMedia, attempt]);

  const visible = useMemo(
    () =>
      state.status === 'ready'
        ? state.items.filter((item) => filter === 'all' || item.kind === filter)
        : [],
    [state, filter]
  );
  const activeIndex = visible.findIndex((item) => item.id === activeId);
  const active = activeIndex >= 0 ? visible[activeIndex] : null;

  const step = useCallback(
    (delta: number) => {
      if (visible.length === 0 || activeIndex < 0) return;
      const next = (activeIndex + delta + visible.length) % visible.length;
      setActiveId(visible[next].id);
    },
    [visible, activeIndex]
  );

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    setActiveId(null);
    lastTrigger.current?.focus();
  };

  if (state.status === 'loading') {
    return (
      <div
        className={className}
        role="status"
        aria-live="polite"
        aria-label="Loading project media"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-video w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={className} role="alert">
        <Text variant="muted">{state.message}</Text>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry
        </Button>
      </div>
    );
  }

  const kinds = Array.from(new Set(state.items.map((item) => item.kind)));

  return (
    <section className={className} aria-label="Project media feed">
      {kinds.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter media by type">
          {(['all', ...kinds] as KindFilter[]).map((kind) => (
            <Button
              key={kind}
              size="sm"
              variant={filter === kind ? 'default' : 'outline'}
              aria-pressed={filter === kind}
              onClick={() => setFilter(kind)}
            >
              {kind === 'all' ? 'All' : KIND_LABELS[kind]}
            </Button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <Text variant="muted">No media has been captured for this project yet.</Text>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="group relative block w-full overflow-hidden rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open ${KIND_LABELS[item.kind]} from ${formatCaptureDate(item.capturedAt)}: ${item.caption}`}
                onClick={(e) => {
                  lastTrigger.current = e.currentTarget;
                  setActiveId(item.id);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumbnailUrl}
                  alt={item.caption}
                  loading="lazy"
                  className="aspect-video w-full object-cover transition-transform group-hover:scale-105"
                />
                <span className="absolute left-2 top-2 flex gap-1">
                  <Badge variant="secondary">{KIND_LABELS[item.kind]}</Badge>
                  {item.isVideo && <Video className="h-4 w-4 text-white" aria-hidden="true" />}
                </span>
                <span className="block bg-background px-2 py-1 text-left text-xs text-muted-foreground">
                  {formatCaptureDate(item.capturedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={active !== null} onOpenChange={handleOpenChange}>
        {active && (
          <DialogContent className="max-w-4xl" onKeyDown={handleKeyDown}>
            <DialogHeader>
              <DialogTitle>{active.caption}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-4 w-4" aria-hidden="true" />
                  {formatCaptureDate(active.capturedAt)}
                </span>
                <span>
                  {KIND_LABELS[active.kind]} · {active.capturedBy}
                </span>
                {active.verified && (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Verified
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            {active.isVideo ? (
              <video
                key={active.id}
                src={active.url}
                poster={active.thumbnailUrl}
                controls
                className="max-h-[60vh] w-full rounded-md bg-black"
              >
                <track kind="captions" />
              </video>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.url}
                alt={active.caption}
                className="max-h-[60vh] w-full rounded-md object-contain"
              />
            )}
            {visible.length > 1 && (
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={() => step(-1)}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Previous
                </Button>
                <Text variant="small" aria-live="polite">
                  {activeIndex + 1} of {visible.length}
                </Text>
                <Button variant="outline" size="sm" onClick={() => step(1)}>
                  Next
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

interface BoundaryState {
  error: Error | null;
}

/** Keeps a rendering failure in the feed from taking down the whole project page. */
export class ProjectMediaFeed extends Component<ProjectMediaFeedProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('[ProjectMediaFeed] render failed', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className={this.props.className} role="alert">
          <Text variant="muted">Project media is unavailable right now.</Text>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </Button>
        </div>
      );
    }
    return <ProjectMediaFeedContent {...this.props} />;
  }
}
