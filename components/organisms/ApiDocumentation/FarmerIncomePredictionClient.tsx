'use client';

import type { ReactNode } from 'react';

export function FarmerIncomePredictionClient(): ReactNode {
  return (
    <section
      aria-labelledby="farmer-income-prediction-heading"
      className="mt-8 rounded-lg border border-gray-200 p-6"
    >
      <h2 id="farmer-income-prediction-heading" className="text-lg font-semibold text-gray-900">
        Farmer Income Prediction
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        Live request builder for the farmer income prediction endpoint.
      </p>
    </section>
  );
}
