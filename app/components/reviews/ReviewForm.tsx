'use client';

import React, { useState } from 'react';
import { StarRating } from './StarRating';
import { ReviewFormValues } from '@/lib/review-types';

interface ReviewFormProps {
  planterId: string;
  onSubmit: (data: ReviewFormValues) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export const ReviewForm: React.FC<ReviewFormProps> = ({
  planterId,
  onSubmit,
  onCancel,
  isSubmitting = false,
}) => {
  const [formData, setFormData] = useState<ReviewFormValues>({
    rating: 0,
    quality: 0,
    responsiveness: 0,
    treeHealth: 0,
    comment: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.rating === 0) {
      alert('Please provide an overall rating');
      return;
    }
    await onSubmit(formData);
  };

  const updateField = (field: keyof ReviewFormValues, value: number | string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-4 border rounded-lg bg-white">
      <h3 className="text-lg font-semibold text-gray-800">Submit a Review</h3>

      {/* Overall Rating */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Overall Rating *
        </label>
        <StarRating
          rating={formData.rating}
          interactive
          onRate={(rating) => updateField('rating', rating)}
          size={32}
        />
      </div>

      {/* Quality */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Quality of Work *
        </label>
        <StarRating
          rating={formData.quality}
          interactive
          onRate={(rating) => updateField('quality', rating)}
          size={24}
        />
      </div>

      {/* Responsiveness */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Responsiveness *
        </label>
        <StarRating
          rating={formData.responsiveness}
          interactive
          onRate={(rating) => updateField('responsiveness', rating)}
          size={24}
        />
      </div>

      {/* Tree Health */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Tree Health Outcomes *
        </label>
        <StarRating
          rating={formData.treeHealth}
          interactive
          onRate={(rating) => updateField('treeHealth', rating)}
          size={24}
        />
      </div>

      {/* Comment */}
      <div>
        <label
          htmlFor="comment"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Additional Comments
        </label>
        <textarea
          id="comment"
          rows={4}
          value={formData.comment}
          onChange={(e) => updateField('comment', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          placeholder="Share your experience with this planting team..."
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || formData.rating === 0}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Review'}
        </button>
      </div>
    </form>
  );
};