'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ReviewCard } from '@/app/components/reviews/ReviewCard';
import { TeamReviewSummary } from '@/app/components/reviews/TeamReviewSummary';
import { Review, ReviewSummary } from '@/lib/types/review';
import { CarbonOffsetCalculator } from '@/app/components/carbon/CarbonOffsetCalculator';
import { ProjectComparison } from '@/app/components/reviews/ProjectComparison';
import { ProjectComparisonItem } from '@/lib/types/projectComparison';

export default function PlanterReviewsPage() {
  const params = useParams();
  const planterId = params.planterId as string;
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparisonItems, setComparisonItems] = useState<ProjectComparisonItem[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(true);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  useEffect(() => {
    fetchReviews();
  }, [planterId]);

  useEffect(() => {
    fetchComparison();
  }, [planterId]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reviews?planterId=${planterId}`);
      if (!response.ok) throw new Error('Failed to fetch reviews');
      
      const data = await response.json();
      setReviews(data.reviews);
      setSummary(data.summary);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchComparison = async () => {
    try {
      setComparisonLoading(true);
      setComparisonError(null);
      const response = await fetch(`/api/projects/compare?planterId=${planterId}`);
      if (!response.ok) throw new Error('Failed to fetch comparison data');

      const data = await response.json();
      setComparisonItems(data.projects ?? []);
    } catch (error) {
      console.error('Error fetching comparison data:', error);
      setComparisonError('Unable to load project comparison data.');
    } finally {
      setComparisonLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Your Reviews</h1>

      {summary && <TeamReviewSummary summary={summary} />}

      <CarbonOffsetCalculator />

      <ProjectComparison
        items={comparisonItems}
        loading={comparisonLoading}
        error={comparisonError}
      />

      <div className="space-y-4">
        {reviews.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No reviews yet.</p>
        ) : (
          reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))
        )}
      </div>
    </div>
  );
}