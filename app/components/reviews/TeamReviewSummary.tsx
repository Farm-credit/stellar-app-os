'use client';

import React from 'react';
import { StarRating } from './StarRating';
import { ReviewSummary } from '@/lib/types/review';

interface TeamReviewSummaryProps {
  summary: ReviewSummary;
}

export const TeamReviewSummary: React.FC<TeamReviewSummaryProps> = ({ summary }) => {
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Review Summary</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-3xl font-bold text-gray-900">{summary.averageRating.toFixed(1)}</span>
              <StarRating rating={Math.round(summary.averageRating)} size={20} />
            </div>
            <p className="text-sm text-gray-500">Based on {summary.totalReviews} reviews</p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Quality</span>
              <span className="font-medium text-gray-900">{summary.qualityAverage.toFixed(1)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full" 
                style={{ width: `${(summary.qualityAverage / 5) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Responsiveness</span>
              <span className="font-medium text-gray-900">{summary.responsivenessAverage.toFixed(1)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full" 
                style={{ width: `${(summary.responsivenessAverage / 5) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tree Health</span>
              <span className="font-medium text-gray-900">{summary.treeHealthAverage.toFixed(1)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full" 
                style={{ width: `${(summary.treeHealthAverage / 5) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Rating Distribution</h4>
          {[5, 4, 3, 2, 1].map((star) => (
            <div key={star} className="flex items-center gap-2">
              <span className="text-xs text-gray-600 w-3">{star}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-yellow-500 h-2 rounded-full" 
                  style={{ width: `${summary.totalReviews > 0 ? (summary.ratingDistribution[star as keyof typeof summary.ratingDistribution] / summary.totalReviews) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-8 text-right">
                {summary.ratingDistribution[star as keyof typeof summary.ratingDistribution]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};