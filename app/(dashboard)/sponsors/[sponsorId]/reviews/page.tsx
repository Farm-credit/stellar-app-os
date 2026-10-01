'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ReviewForm } from '@/app/components/reviews/ReviewForm';
import { ReviewCard } from '@/app/components/reviews/ReviewCard';
import { TeamReviewSummary } from '@/app/components/reviews/TeamReviewSummary';
import { Review, ReviewSummary } from '@/lib/types/review';
import { CarbonOffsetCalculator } from '@/app/components/carbon/CarbonOffsetCalculator';
import { OffsetProjectSearch } from '@/app/components/carbon/OffsetProjectSearch';
import { BulkPurchaseAgreementForm } from '@/app/components/marketplace/BulkPurchaseAgreementForm';
import { BulkPurchaseAgreementCard } from '@/app/components/marketplace/BulkPurchaseAgreementCard';
import type { BulkPurchaseAgreement } from '@/lib/types/bulkPurchase';

export default function SponsorReviewsPage() {
  const params = useParams();
  const sponsorId = params.sponsorId as string;
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
const [showProjectSearch, setShowProjectSearch] = useState(false);
  const [agreements, setAgreements] = useState<BulkPurchaseAgreement[]>([]);
  const [agreementsLoading, setAgreementsLoading] = useState(true);
  const [showAgreementForm, setShowAgreementForm] = useState(false);
  const [submittingAgreement, setSubmittingAgreement] = useState(false);

  useEffect(() => {
    fetchReviews();
  }, [sponsorId]);

  useEffect(() => {
    fetchAgreements();
  }, [sponsorId]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reviews?sponsorId=${sponsorId}`);
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

  const fetchAgreements = async () => {
    try {
      setAgreementsLoading(true);
      const response = await fetch(`/api/marketplace/bulk-agreements?sponsorId=${sponsorId}`);
      if (!response.ok) throw new Error('Failed to fetch bulk agreements');
      const data = await response.json();
      setAgreements(data.agreements ?? []);
    } catch (error) {
      console.error('Error fetching bulk agreements:', error);
    } finally {
      setAgreementsLoading(false);
    }
  };

  const handleSubmit = async (data: any) => {
    try {
      setSubmitting(true);
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, sponsorId }),
      });
      
      if (!response.ok) throw new Error('Failed to submit review');
      
      setShowForm(false);
      await fetchReviews();
    } catch (error) {
      console.error('Error submitting review:', error);
      alert('Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAgreement = async (data: any) => {
    try {
      setSubmittingAgreement(true);
      const response = await fetch('/api/marketplace/bulk-agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, sponsorId }),
      });
      if (!response.ok) throw new Error('Failed to create bulk purchase agreement');
      setShowAgreementForm(false);
      await fetchAgreements();
    } catch (error) {
      console.error('Error creating bulk purchase agreement:', error);
      alert('Failed to create bulk purchase agreement. Please try again.');
    } finally {
      setSubmittingAgreement(false);
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
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Planting Team Reviews</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          {showForm ? 'Cancel' : 'Write Review'}
        </button>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => setShowProjectSearch(!showProjectSearch)}
          className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          {showProjectSearch ? 'Hide Project Search' : 'Search Offset Projects'}
        </button>
        <button
          onClick={() => setShowCalculator(!showCalculator)}
          className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          {showCalculator ? 'Hide Carbon Calculator' : 'Calculate My Carbon Offset'}
        </button>
      </div>

      {showProjectSearch && <OffsetProjectSearch />}

      {showCalculator && <CarbonOffsetCalculator />}

      {summary && <TeamReviewSummary summary={summary} />}

      {showForm && (
        <ReviewForm
          planterId=""
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
          isSubmitting={submitting}
        />
      )}

      <div className="space-y-4">
        {reviews.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No reviews yet. Be the first to review!</p>
        ) : (
          reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))
        )}
      </div>

      <div className="border-t border-gray-200 pt-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Bulk Purchase Agreements</h2>
          <button
            onClick={() => setShowAgreementForm(!showAgreementForm)}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            {showAgreementForm ? 'Cancel' : 'Create Bulk Agreement'}
          </button>
        </div>

        {showAgreementForm && (
          <BulkPurchaseAgreementForm
            onSubmit={handleSubmitAgreement}
            onCancel={() => setShowAgreementForm(false)}
            isSubmitting={submittingAgreement}
          />
        )}

        {agreementsLoading ? (
          <p className="text-center text-gray-500 py-4">Loading agreements...</p>
        ) : agreements.length === 0 ? (
          <p className="text-center text-gray-500 py-4">No bulk purchase agreements yet.</p>
        ) : (
          <div className="space-y-4">
            {agreements.map((agreement) => (
              <BulkPurchaseAgreementCard key={agreement.id} agreement={agreement} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
