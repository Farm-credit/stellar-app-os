'use client';

import { useState, type FormEvent } from 'react';
import { Bell, CalendarDays, Camera, CheckCircle2, Ruler, Upload, User } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { TreeGrowthStageBadge } from '@/components/molecules/TreeGrowthStageBadge';
import type { TreeGrowthStage } from '@/lib/types/tree';
import type {
  GrowthStagePhoto,
  GrowthStageTransitionNotification,
} from '@/lib/types/tree-growth';
import {
  GROWTH_STAGE_DESCRIPTIONS,
  GROWTH_STAGE_LABELS,
  GROWTH_STAGE_ORDER,
  sortStagePhotosChronologically,
} from '@/lib/tree-growth/stages';
import { cn } from '@/lib/utils';

export interface TreeStagePhotoTimelineProps {
  treeId: string;
  initialStage: TreeGrowthStage;
  initialPhotos: GrowthStagePhoto[];
  initialNotifications?: GrowthStageTransitionNotification[];
}

function formatPhotoDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function TreeStagePhotoTimeline({
  treeId,
  initialStage,
  initialPhotos,
  initialNotifications = [],
}: TreeStagePhotoTimelineProps) {
  const [currentStage, setCurrentStage] = useState<TreeGrowthStage>(initialStage);
  const [photos, setPhotos] = useState<GrowthStagePhoto[]>(() =>
    sortStagePhotosChronologically(initialPhotos)
  );
  const [latestNotification, setLatestNotification] =
    useState<GrowthStageTransitionNotification | null>(
      initialNotifications[initialNotifications.length - 1] ?? null
    );

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [stage, setStage] = useState<TreeGrowthStage>(initialStage);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadedBy, setUploadedBy] = useState('');
  const [caption, setCaption] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStageIndex = GROWTH_STAGE_ORDER.indexOf(currentStage);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!imageUrl.trim() || !uploadedBy.trim()) {
      setError('Photo URL and field team name are required.');
      return;
    }

    const parsedHeight = heightCm.trim() ? Number(heightCm) : undefined;
    if (parsedHeight !== undefined && (!Number.isFinite(parsedHeight) || parsedHeight < 0)) {
      setError('Height must be a valid non-negative number.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/trees/${encodeURIComponent(treeId)}/growth-stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          imageUrl: imageUrl.trim(),
          uploadedBy: uploadedBy.trim(),
          caption: caption.trim() || undefined,
          heightCm: parsedHeight,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.error ?? 'Failed to upload growth stage photo.');
        return;
      }

      setPhotos((prev) => sortStagePhotosChronologically([...prev, data.photo]));
      setCurrentStage(data.currentStage);
      if (data.transitioned && data.notification) {
        setLatestNotification(data.notification);
      }

      setImageUrl('');
      setCaption('');
      setHeightCm('');
      setShowUploadForm(false);
    } catch {
      setError('Network error while uploading photo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card data-testid="tree-stage-photo-timeline">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-4 w-4 text-stellar-green" aria-hidden />
              Growth Stage Photo Timeline
            </CardTitle>
            <TreeGrowthStageBadge stage={currentStage} />
          </div>
          <button
            type="button"
            onClick={() => setShowUploadForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden />
            {showUploadForm ? 'Cancel' : 'Upload stage photo'}
          </button>
        </div>
        <CardDescription>
          Chronological field-team photos tracking this tree from sapling to mature canopy.
        </CardDescription>

        {/* Stage progression stepper */}
        <ol
          aria-label="Growth stage progression"
          className="grid grid-cols-3 gap-2 pt-1"
        >
          {GROWTH_STAGE_ORDER.map((item, idx) => {
            const reached = idx <= currentStageIndex;
            const isCurrent = item === currentStage;
            return (
              <li
                key={item}
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs transition-colors',
                  isCurrent
                    ? 'border-stellar-green bg-stellar-green/10 font-semibold text-foreground'
                    : reached
                      ? 'border-border bg-muted/40 text-foreground'
                      : 'border-border/60 bg-background text-muted-foreground'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <CheckCircle2
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      reached ? 'text-stellar-green' : 'text-muted-foreground/40'
                    )}
                    aria-hidden
                  />
                  <span>{GROWTH_STAGE_LABELS[item]}</span>
                </div>
                <p className="mt-1 hidden text-[11px] font-normal text-muted-foreground sm:block">
                  {GROWTH_STAGE_DESCRIPTIONS[item]}
                </p>
              </li>
            );
          })}
        </ol>
      </CardHeader>

      <CardContent className="space-y-4">
        {latestNotification ? (
          <div
            role="status"
            data-testid="stage-transition-notification"
            className="flex items-start gap-2.5 rounded-lg border border-stellar-green/40 bg-stellar-green/10 p-3 text-sm"
          >
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-stellar-green" aria-hidden />
            <div>
              <p className="font-semibold text-foreground">{latestNotification.title}</p>
              <p className="text-xs text-muted-foreground">{latestNotification.message}</p>
            </div>
          </div>
        ) : null}

        {showUploadForm ? (
          <form
            onSubmit={handleSubmit}
            data-testid="stage-photo-upload-form"
            className="space-y-3 rounded-xl border border-border bg-muted/30 p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-xs font-medium">
                <span>Growth stage</span>
                <select
                  aria-label="Growth stage"
                  value={stage}
                  onChange={(e) => setStage(e.target.value as TreeGrowthStage)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                >
                  {GROWTH_STAGE_ORDER.map((option) => (
                    <option key={option} value={option}>
                      {GROWTH_STAGE_LABELS[option]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1 text-xs font-medium">
                <span>Field team / uploader</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rift Valley Field Team"
                  value={uploadedBy}
                  onChange={(e) => setUploadedBy(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1 text-xs font-medium sm:col-span-2">
                <span>Photo URL</span>
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                />
              </label>

              <label className="block space-y-1 text-xs font-medium">
                <span>Height (cm)</span>
                <input
                  type="number"
                  min={0}
                  placeholder="Optional"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                />
              </label>
            </div>

            <label className="block space-y-1 text-xs font-medium">
              <span>Field notes / caption</span>
              <input
                type="text"
                placeholder="Optional observation from the field team"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
              />
            </label>

            {error ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-stellar-green px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Uploading…' : 'Save stage photo'}
              </button>
            </div>
          </form>
        ) : null}

        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No field-team stage photos have been uploaded yet.
          </p>
        ) : (
          <ol
            aria-label="Chronological growth stage photos"
            className="relative space-y-4 border-l border-border pl-5"
          >
            {photos.map((photo) => (
              <li
                key={photo.id}
                data-testid="stage-photo-item"
                data-stage={photo.stage}
                className="relative"
              >
                <span
                  aria-hidden
                  className="absolute -left-[25px] top-2 h-3 w-3 rounded-full border-2 border-stellar-green bg-background"
                />
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.imageUrl}
                    alt={`${GROWTH_STAGE_LABELS[photo.stage]} stage photo uploaded by ${photo.uploadedBy}`}
                    loading="lazy"
                    className="h-44 w-full object-cover sm:h-56"
                  />
                  <div className="space-y-2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <TreeGrowthStageBadge stage={photo.stage} />
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                        <time dateTime={photo.uploadedAt}>
                          {formatPhotoDate(photo.uploadedAt)}
                        </time>
                      </span>
                    </div>
                    {photo.caption ? (
                      <p className="text-sm text-foreground">{photo.caption}</p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5" aria-hidden />
                        {photo.uploadedBy}
                      </span>
                      {photo.heightCm !== undefined ? (
                        <span className="inline-flex items-center gap-1">
                          <Ruler className="h-3.5 w-3.5" aria-hidden />
                          {photo.heightCm} cm
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
