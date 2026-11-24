'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';

interface VerificationPhoto {
  id: number;
  treeId: number;
  treeRef: string;
  mediaUrl: string;
  baselineMediaUrl: string | null;
  baselineCreatedAt: string | null;
  ipfsCid: string | null;
  lat: string | null;
  lng: string | null;
  submittedBy: string | null;
  createdAt: string;
  treeStatus: string;
  planterName: string | null;
  species: string | null;
  region: string;
  photoHash: string | null;
  duplicateOf: number | null;
  hammingDistance: number | null;
}

interface PhotosResponse {
  photos: VerificationPhoto[];
  totalCount: number;
  page: number;
  totalPages: number;
}

interface BatchResponse {
  success: boolean;
  processed: number;
  conflicts: { resolution: string }[];
  message: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function resolveImageUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith('ipfs://')) {
    return `https://gateway.pinata.cloud/ipfs/${value.slice('ipfs://'.length)}`;
  }
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return null;
}

function ComparisonImage({
  src,
  alt,
  emptyLabel,
}: {
  src: string | null;
  alt: string;
  emptyLabel: string;
}): React.ReactNode {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed bg-muted/40 p-6 text-center">
        <Text variant="muted">{failed ? 'Image could not be loaded.' : emptyLabel}</Text>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-muted/30">
      <Image
        src={src}
        alt={alt}
        width={1200}
        height={900}
        unoptimized
        className="aspect-[4/3] w-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export default function VerifierQueuePage(): React.ReactNode {
  const [photos, setPhotos] = useState<VerificationPhoto[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/verification/photos?page=${page}&limit=20&status=pending`
      );
      const result = (await response.json()) as PhotosResponse & { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? 'Could not load the verification queue.');
      }

      setPhotos(result.photos);
      setTotalCount(result.totalCount);
      setTotalPages(Math.max(result.totalPages, 1));
      setSelectedPhotoId((current) =>
        result.photos.some((photo) => photo.id === current)
          ? current
          : (result.photos[0]?.id ?? null)
      );
    } catch (loadError) {
      console.error('Failed to load verifier photo queue:', loadError);
      setError(
        loadError instanceof Error ? loadError.message : 'Could not load the verification queue.'
      );
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void fetchPhotos();
  }, [fetchPhotos]);

  const selectedPhoto = photos.find((photo) => photo.id === selectedPhotoId) ?? null;

  const submitDecision = async (action: 'approve' | 'reject') => {
    if (!selectedPhoto) return;

    setActionLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch('/api/admin/verification/photos/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds: [selectedPhoto.id], action }),
      });
      const result = (await response.json()) as BatchResponse & { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? 'Could not save the review decision.');
      }

      setFeedback(
        result.processed > 0
          ? result.message
          : `No decision was saved. ${result.conflicts.map((conflict) => conflict.resolution).join(', ')}`
      );
      await fetchPhotos();
    } catch (decisionError) {
      console.error('Failed to submit verifier photo decision:', decisionError);
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : 'Could not save the review decision.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <main className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Text as="h1" variant="h2">
            Tree verification queue
          </Text>
          <Text variant="muted">
            Compare each submitted tree photo with its earliest historical photo before deciding.
          </Text>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void fetchPhotos()}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh queue
        </Button>
      </header>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          <span>{error}</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => void fetchPhotos()}
            disabled={loading}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {feedback ? (
        <p
          role="status"
          className="rounded-lg border border-stellar-blue/30 bg-stellar-blue/5 p-4 text-sm"
        >
          {feedback}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Pending submissions</CardTitle>
            <CardDescription>{totalCount} photo(s) awaiting review</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && photos.length === 0 ? (
              <p role="status" className="py-8 text-center text-sm text-muted-foreground">
                Loading verification queue…
              </p>
            ) : photos.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No tree photos are waiting for review.
              </p>
            ) : (
              <ul aria-label="Pending tree photo submissions" className="space-y-2">
                {photos.map((photo) => (
                  <li key={photo.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPhotoId(photo.id);
                        setFeedback(null);
                      }}
                      aria-pressed={selectedPhoto?.id === photo.id}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        selectedPhoto?.id === photo.id
                          ? 'border-stellar-blue bg-stellar-blue/5'
                          : 'border-border hover:border-stellar-blue/40'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{photo.treeRef}</span>
                        {photo.duplicateOf !== null ? (
                          <Badge variant="destructive">Possible duplicate</Badge>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {photo.species ?? 'Unknown species'} · {photo.region}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Submitted {formatDate(photo.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={loading || page <= 1}
                aria-label="Previous page"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={loading || page >= totalPages}
                aria-label="Next page"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {selectedPhoto ? (
          <section aria-label={`Review ${selectedPhoto.treeRef}`} className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{selectedPhoto.treeRef}</CardTitle>
                    <CardDescription>
                      {selectedPhoto.species ?? 'Unknown species'} · {selectedPhoto.region}
                      {selectedPhoto.planterName ? ` · ${selectedPhoto.planterName}` : ''}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{selectedPhoto.treeStatus}</Badge>
                    {selectedPhoto.duplicateOf !== null ? (
                      <Badge variant="destructive">
                        <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                        Duplicate risk ({selectedPhoto.hammingDistance ?? '?'} bit distance)
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-semibold">Historical baseline</h2>
                      <span className="text-xs text-muted-foreground">
                        {selectedPhoto.baselineCreatedAt
                          ? formatDate(selectedPhoto.baselineCreatedAt)
                          : 'No earlier photo'}
                      </span>
                    </div>
                    <ComparisonImage
                      key={`baseline-${selectedPhoto.id}`}
                      src={resolveImageUrl(selectedPhoto.baselineMediaUrl)}
                      alt={`Historical baseline for tree ${selectedPhoto.treeRef}`}
                      emptyLabel="No earlier photo is available for comparison."
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-semibold">Submitted photo</h2>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(selectedPhoto.createdAt)}
                      </span>
                    </div>
                    <ComparisonImage
                      key={`submitted-${selectedPhoto.id}`}
                      src={resolveImageUrl(selectedPhoto.mediaUrl)}
                      alt={`Submitted verification photo for tree ${selectedPhoto.treeRef}`}
                      emptyLabel="The submitted photo has no displayable image URL."
                    />
                  </div>
                </div>

                <dl className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Submitted by</dt>
                    <dd>{selectedPhoto.submittedBy ?? 'Unknown'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Coordinates</dt>
                    <dd>
                      {selectedPhoto.lat && selectedPhoto.lng
                        ? `${selectedPhoto.lat}, ${selectedPhoto.lng}`
                        : 'Not available'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Photo hash</dt>
                    <dd className="break-all font-mono">
                      {selectedPhoto.photoHash ?? 'Not available'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">IPFS CID</dt>
                    <dd className="break-all font-mono">
                      {selectedPhoto.ipfsCid ?? 'Not available'}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void submitDecision('reject')}
                    disabled={actionLoading || loading}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject photo
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void submitDecision('approve')}
                    disabled={actionLoading || loading}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Approve tree
                  </Button>
                </div>
                {actionLoading ? (
                  <p role="status" className="text-right text-sm text-muted-foreground">
                    Saving review decision…
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </section>
        ) : !loading && !error ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Text variant="muted">Select a submission to compare its photos.</Text>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
