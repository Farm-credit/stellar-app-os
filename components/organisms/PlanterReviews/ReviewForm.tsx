'use client';

import { useState } from 'react';
import { Send, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { StarRating } from '@/components/molecules/StarRating';
import { addPlanterReview } from '@/lib/api/mock/planterReviews';
import { REVIEW_CATEGORY_LABELS, type ReviewCategory } from '@/lib/types/planter';

interface ReviewFormProps {
  planterId: string;
  planterName: string;
  onReviewSubmitted?: () => void;
}

const CATEGORIES: ReviewCategory[] = ['quality', 'responsiveness', 'treeHealth'];

/**
 * Form allowing sponsors to submit a review for a planting team.
 * Shows a 5-star overall rating plus per-category ratings and a text comment.
 */
export function ReviewForm({ planterId, planterName, onReviewSubmitted }: ReviewFormProps) {
  const [overallRating, setOverallRating] = useState(0);
  const [categoryRatings, setCategoryRatings] = useState<Record<ReviewCategory, number>>({
    quality: 0,
    responsiveness: 0,
    treeHealth: 0,
  });
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleCategoryChange = (category: ReviewCategory, value: number) => {
    setCategoryRatings((prev) => ({ ...prev, [category]: value }));
  };

  const canSubmit = overallRating > 0 && comment.trim().length >= 10;

  const handleSubmit = () => {
    if (!canSubmit) {
      setError('Please provide a rating and at least 10 characters of feedback.');
      return;
    }

    // Validate all categories have ratings
    const missingCategories = CATEGORIES.filter((cat) => categoryRatings[cat] === 0);
    if (missingCategories.length > 0) {
      setError('Please rate all categories before submitting.');
      return;
    }

    setError('');
    addPlanterReview({
      planterId,
      sponsorName: 'You',
      rating: overallRating,
      categoryRatings,
      comment: comment.trim(),
    });

    setSubmitted(true);
    onReviewSubmitted?.();
  };

  if (submitted) {
    return (
      <div className="rounded-2xl border border-stellar-green/20 bg-stellar-green/5 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-stellar-green" aria-hidden />
        <Text variant="h4" as="h3" className="font-bold text-stellar-green">
          Review submitted!
        </Text>
        <Text variant="muted" as="p" className="mt-1 text-sm">
          Thank you for rating {planterName}. Your review helps other sponsors make informed
          decisions.
        </Text>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stellar-blue/10 bg-card p-6">
      <Text variant="h4" as="h3" className="mb-4 font-bold">
        Leave a Review
      </Text>

      {/* Overall rating */}
      <div className="mb-5">
        <Text variant="small" className="mb-2 font-medium">
          Overall Rating
        </Text>
        <StarRating
          rating={overallRating}
          interactive
          onRatingChange={setOverallRating}
          size="lg"
          ariaLabel="Overall rating"
        />
      </div>

      {/* Category ratings */}
      <div className="mb-5 space-y-3">
        <Text variant="small" className="font-medium">
          Rate by category
        </Text>
        {CATEGORIES.map((category) => (
          <div key={category} className="flex items-center justify-between gap-4">
            <Text variant="small" className="text-muted-foreground">
              {REVIEW_CATEGORY_LABELS[category]}
            </Text>
            <StarRating
              rating={categoryRatings[category]}
              interactive
              onRatingChange={(value) => handleCategoryChange(category, value)}
              size="sm"
              ariaLabel={REVIEW_CATEGORY_LABELS[category]}
            />
          </div>
        ))}
      </div>

      {/* Comment */}
      <div className="mb-4">
        <label htmlFor="review-comment" className="mb-1.5 block text-sm font-medium">
          Your experience
        </label>
        <textarea
          id="review-comment"
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={`Share your experience working with ${planterName} — planting quality, communication, tree outcomes…`}
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Text variant="small" className="mt-1 text-muted-foreground">
          {comment.length} / 10 minimum characters
        </Text>
      </div>

      {/* Error */}
      {error && (
        <Text variant="small" className="mb-3 text-destructive">
          {error}
        </Text>
      )}

      {/* Submit */}
      <Button
        type="button"
        stellar="primary"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="gap-2"
        size="sm"
      >
        <Send className="h-4 w-4" aria-hidden />
        Submit Review
      </Button>
    </div>
  );
}
