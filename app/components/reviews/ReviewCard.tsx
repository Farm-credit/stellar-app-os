'use client';

import React from 'react';
import { StarRating } from './StarRating';
import { Review } from '@/lib/types/review';

interface ReviewCardProps {
  review: Review;
}

export const ReviewCard: React.FC<ReviewCardProps> = ({ review }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="p-6 border border-gray-200 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <StarRating rating={review.rating} size={20} />
            <span className="text-sm font-medium text-gray-900">{review.rating.toFixed(1)}</span>
          </div>
          <p className="text-xs text-gray-500">{formatDate(review.createdAt)}</p>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Quality</span>
          <div className="flex items-center gap-1">
            <StarRating rating={review.quality} size={14} />
            <span className="text-xs text-gray-500">{review.quality}</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Responsiveness</span>
          <div className="flex items-center gap-1">
            <StarRating rating={review.responsiveness} size={14} />
            <span className="text-xs text-gray-500">{review.responsiveness}</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Tree Health</span>
          <div className="flex items-center gap-1">
            <StarRating rating={review.treeHealth} size={14} />
            <span className="text-xs text-gray-500">{review.treeHealth}</span>
          </div>
        </div>
      </div>

      {review.comment && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-gray-700 text-sm leading-relaxed">{review.comment}</p>
        </div>
      )}
    </div>
  );
};