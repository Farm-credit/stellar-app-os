'use client';

import React from 'react';
import { StarRating } from './StarRating';
import { Review } from '@/lib/review-types';

interface ReviewListProps {
  reviews: Review[];
  isLoading?: boolean;
  error?: string | null;
}

export const ReviewList: React.FC<ReviewListProps> = ({
  reviews,
  isLoading = false,
  error = null,
}) => {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        <span className="ml-2 text-gray-600">Loading reviews...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-red-700">Error loading reviews: {error}</p>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No reviews yet. Be the first to review this planting team!</p>
      </div>
    );
  }

  // Calculate average ratings
  const avgRating =
    reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const avgQuality =
    reviews.reduce((sum, r) => sum + r.quality, 0) / reviews.length;
  const avgResponsiveness =
    reviews.reduce((sum, r) => sum + r.responsiveness, 0) / reviews.length;
  const avgTreeHealth =
    reviews.reduce((sum, r) => sum + r.treeHealth, 0) / reviews.length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="p-4 bg-gray-50 rounded-lg border">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">
          Review Summary
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-sm text-gray-600">Overall</p>
            <StarRating rating={Math.round(avgRating)} size={20} />
            <p className="text-xs text-gray-500 mt-1">
              {avgRating.toFixed(1)} / 5
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Quality</p>
            <StarRating rating={Math.round(avgQuality)} size={20} />
            <p className="text-xs text-gray-500 mt-1">
              {avgQuality.toFixed(1)} / 5
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Responsiveness</p>
            <StarRating rating={Math.round(avgResponsiveness)} size={20} />
            <p className="text-xs text-gray-500 mt-1">
              {avgResponsiveness.toFixed(1)} / 5
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Tree Health</p>
            <StarRating rating={Math.round(avgTreeHealth)} size={20} />
            <p className="text-xs text-gray-500 mt-1">
              {avgTreeHealth.toFixed(1)} / 5
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Based on {reviews.length} review{reviews.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Individual Reviews */}
      <div className="space-y-4">
        {reviews.map((review) => (
          <div
            key={review.id}
            className="p-4 border rounded-lg bg-white shadow-sm"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-sm text-gray-500">
                  Reviewed by: {review.sponsorId || 'Anonymous'}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(review.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <StarRating rating={review.rating} size={20} />
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
              <div>
                <span className="text-gray-600">Quality:</span>{' '}
                <StarRating rating={review.quality} size={14} />
              </div>
              <div>
                <span className="text-gray-600">Responsiveness:</span>{' '}
                <StarRating rating={review.responsiveness} size={14} />
              </div>
              <div>
                <span className="text-gray-600">Tree Health:</span>{' '}
                <StarRating rating={review.treeHealth} size={14} />
              </div>
            </div>

            {review.comment && (
              <p className="text-gray-700 text-sm mt-2 italic">
                "{review.comment}"
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};