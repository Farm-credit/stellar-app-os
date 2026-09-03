'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Star, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Card, CardContent } from '@/components/molecules/Card';
import { StarRating } from '@/components/molecules/StarRating';
import { ReviewForm } from './ReviewForm';
import { getPlanterReviews, getPlanterReviewSummary } from '@/lib/api/mock/planterReviews';
import { REVIEW_CATEGORY_LABELS, type ReviewCategory } from '@/lib/types/planter';

interface PlanterReviewsProps {
  planterId: string;
  planterName: string;
}

const CATEGORIES: ReviewCategory[] = ['quality', 'responsiveness', 'treeHealth'];

/**
 * Transparent review system for planting teams. Shows a summary with average
 * rating, per-category averages, rating distribution bar chart, individual
 * review cards, and a form for new reviews.
 */
export function PlanterReviews({ planterId, planterName }: PlanterReviewsProps) {
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Re-compute when a review is submitted
  const summary = getPlanterReviewSummary(planterId);
  const reviews = getPlanterReviews(planterId);

  const handleReviewSubmitted = () => {
    setRefreshKey((k) => k + 1);
    setShowForm(false);
  };

  return (
    <section className="space-y-6" key={refreshKey}>
      <div className="flex items-center justify-between">
        <Text variant="h4" as="h2" className="flex items-center gap-2 font-bold">
          <Star className="h-5 w-5 text-amber-400" aria-hidden />
          Sponsor Reviews
          {summary.totalReviews > 0 && (
            <Badge variant="secondary" className="ml-1">
              {summary.totalReviews}
            </Badge>
          )}
        </Text>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="gap-1.5"
        >
          <MessageSquare className="h-4 w-4" aria-hidden />
          {showForm ? 'Cancel' : 'Write a Review'}
        </Button>
      </div>

      {/* Review form */}
      {showForm && (
        <ReviewForm
          planterId={planterId}
          planterName={planterName}
          onReviewSubmitted={handleReviewSubmitted}
        />
      )}

      {/* Summary card */}
      {summary.totalReviews > 0 && (
        <Card className="rounded-2xl border-stellar-blue/10">
          <CardContent className="p-6">
            <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
              {/* Overall score */}
              <div className="flex flex-col items-center justify-center text-center">
                <div className="text-5xl font-bold leading-none text-slate-900">
                  {summary.averageRating.toFixed(1)}
                </div>
                <StarRating rating={summary.averageRating} size="md" />
                <Text variant="small" className="mt-1 text-muted-foreground">
                  {summary.totalReviews} review{summary.totalReviews !== 1 ? 's' : ''}
                </Text>
              </div>

              {/* Category breakdown + distribution */}
              <div className="space-y-4">
                {/* Category averages */}
                <div className="space-y-2">
                  {CATEGORIES.map((category) => (
                    <div key={category} className="flex items-center gap-3">
                      <Text variant="small" className="w-36 shrink-0 text-muted-foreground">
                        {REVIEW_CATEGORY_LABELS[category]}
                      </Text>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-amber-400 transition-all"
                          style={{ width: `${(summary.categoryAverages[category] / 5) * 100}%` }}
                        />
                      </div>
                      <Text variant="small" className="w-8 text-right font-medium">
                        {summary.categoryAverages[category].toFixed(1)}
                      </Text>
                    </div>
                  ))}
                </div>

                {/* Rating distribution */}
                <div className="space-y-1.5 border-t border-border pt-3">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = summary.ratingDistribution[star] ?? 0;
                    const pct = summary.totalReviews > 0 ? (count / summary.totalReviews) * 100 : 0;
                    return (
                      <div key={star} className="flex items-center gap-2 text-sm">
                        <span className="w-4 text-right text-muted-foreground">{star}</span>
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-6 text-right text-xs text-muted-foreground">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Individual reviews */}
      {reviews.length > 0 && (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}

      {summary.totalReviews === 0 && !showForm && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Star className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" aria-hidden />
          <Text variant="muted" as="p">
            No reviews yet. Be the first to share your experience with {planterName}.
          </Text>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-1.5"
            onClick={() => setShowForm(true)}
          >
            <MessageSquare className="h-4 w-4" aria-hidden />
            Write a Review
          </Button>
        </div>
      )}
    </section>
  );
}

// ── Individual review card ──────────────────────────────────────────────

function ReviewCard({ review }: { review: ReturnType<typeof getPlanterReviews>[number] }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = review.comment.length > 200;

  return (
    <Card className="rounded-2xl border-stellar-blue/10">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {review.sponsorAvatarUrl ? (
              <Image
                src={review.sponsorAvatarUrl}
                alt={review.sponsorName}
                width={36}
                height={36}
                className="rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
                {review.sponsorName.charAt(0)}
              </div>
            )}
            <div>
              <Text variant="small" className="font-semibold">
                {review.sponsorName}
              </Text>
              <Text variant="small" className="text-muted-foreground">
                {new Date(review.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
            </div>
          </div>
          <StarRating rating={review.rating} size="sm" />
        </div>

        {/* Category mini-ratings */}
        <div className="mt-3 flex flex-wrap gap-3">
          {CATEGORIES.map((cat) => (
            <div key={cat} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{REVIEW_CATEGORY_LABELS[cat]}:</span>
              <StarRating rating={review.categoryRatings[cat]} size="sm" />
            </div>
          ))}
        </div>

        {/* Comment */}
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {isLong && !expanded ? `${review.comment.slice(0, 200)}…` : review.comment}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-stellar-blue hover:underline"
          >
            {expanded ? (
              <>
                Show less <ChevronUp className="h-3 w-3" aria-hidden />
              </>
            ) : (
              <>
                Read more <ChevronDown className="h-3 w-3" aria-hidden />
              </>
            )}
          </button>
        )}

        {/* Tags */}
        {(review.treeSpecies || review.projectId) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {review.treeSpecies && (
              <Badge variant="secondary" className="text-xs">
                🌳 {review.treeSpecies}
              </Badge>
            )}
            {review.projectId && (
              <Badge variant="accent" className="text-xs">
                Project
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
