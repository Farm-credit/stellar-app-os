'use client';

import React from 'react';
import Link from 'next/link';
import SocialShareButtons from './SocialShareButtons';
import { generateShareText } from '../lib/sharing';

export interface QuizSpeciesRecommendation {
  id: string;
  name: string;
  scientificName?: string;
  description?: string;
  co2PerYearKg?: number;
  maturityYears?: number;
  imageUrl?: string;
}

export interface QuizResult {
  quizTitle?: string;
  score?: number;
  totalQuestions?: number;
  resultTitle: string;
  resultSummary: string;
  recommendedSpecies: QuizSpeciesRecommendation[];
  sponsorUrl?: string;
}

interface QuizResultCardProps {
  result: QuizResult;
  shareUrl?: string;
  className?: string;
}

const DEFAULT_SPONSOR_URL = '/sponsor';

function formatNumber(value: number | undefined): string | null {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return null;
  }
  return new Intl.NumberFormat('en-US').format(value);
}

export default function QuizResultCard({
  result,
  shareUrl,
  className = '',
}: QuizResultCardProps) {
  const {
    quizTitle = 'Tree Species Quiz',
    score,
    totalQuestions,
    resultTitle,
    resultSummary,
    recommendedSpecies = [],
    sponsorUrl = DEFAULT_SPONSOR_URL,
  } = result;

  const speciesNames = recommendedSpecies.map((species) => species.name).join(', ');

  const shareTitle = `${resultTitle} — ${quizTitle}`;
  const shareDescription = generateShareText({
    title: shareTitle,
    description: resultSummary,
    species: speciesNames,
  });

  const resolvedShareUrl =
    shareUrl ??
    (typeof window !== 'undefined' ? window.location.href : undefined);

  return (
    <div
      className={`rounded-2xl border border-green-200 bg-white p-6 shadow-lg ${className}`.trim()}
    >
      <div className="mb-4">
        <p className="text-sm font-medium uppercase tracking-wide text-green-600">
          {quizTitle}
        </p>
        <h2 className="mt-1 text-2xl font-bold text-gray-900">{resultTitle}</h2>
        {score !== undefined && totalQuestions !== undefined && (
          <p className="mt-1 text-sm text-gray-500">
            You scored {score} out of {totalQuestions}
          </p>
        )}
      </div>

      <p className="mb-6 text-gray-700">{resultSummary}</p>

      {recommendedSpecies.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            Recommended species for you
          </h3>
          <ul className="space-y-4">
            {recommendedSpecies.map((species) => {
              const co2 = formatNumber(species.co2PerYearKg);
              const maturity = formatNumber(species.maturityYears);
              return (
                <li
                  key={species.id}
                  className="flex gap-4 rounded-xl border border-gray-100 bg-green-50/50 p-4"
                >
                  {species.imageUrl && (
                    <img
                      src={species.imageUrl}
                      alt={species.name}
                      className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{species.name}</p>
                    {species.scientificName && (
                      <p className="text-sm italic text-gray-500">
                        {species.scientificName}
                      </p>
                    )}
                    {species.description && (
                      <p className="mt-1 text-sm text-gray-600">
                        {species.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
                      {co2 && (
                        <span className="rounded-full bg-green-100 px-2 py-1 font-medium text-green-800">
                          {co2} kg CO₂ / year
                        </span>
                      )}
                      {maturity && (
                        <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-800">
                          Matures in {maturity} years
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mb-6">
        <Link
          href={sponsorUrl}
          className="inline-flex items-center justify-center rounded-lg bg-green-600 px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
        >
          Sponsor a tree
        </Link>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <p className="mb-2 text-sm font-medium text-gray-700">Share your result</p>
        <SocialShareButtons
          url={resolvedShareUrl}
          title={shareTitle}
          description={shareDescription}
        />
      </div>
    </div>
  );
}