'use client';

import type { JSX } from 'react';
import type { ProjectClimateComparison } from '@/lib/climate/climateComparisonTypes';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';

interface ClimateComparisonModalProps {
  comparison: ProjectClimateComparison | null;
  onClose: () => void;
}

export function ClimateComparisonModal({
  comparison,
  onClose,
}: ClimateComparisonModalProps): JSX.Element | null {
  if (!comparison) return null;

  const {
    projectName,
    location,
    source,
    historicalYearRange,
    currentYear,
    historical,
    current,
    comparison: comp,
    plantingConditions,
  } = comparison;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="climate-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-background border border-border rounded-2xl shadow-2xl p-6 overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/80 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge
                variant="outline"
                className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
              >
                🌱 Planting Conditions & Climate Data
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {plantingConditions.overallCondition}
              </Badge>
            </div>
            <h2 id="climate-modal-title" className="text-xl font-bold text-foreground">
              {projectName}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              📍 {location} • Lat: {comparison.coordinates.latitude.toFixed(4)}, Lon:{' '}
              {comparison.coordinates.longitude.toFixed(4)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-muted-foreground hover:text-foreground text-lg p-1.5 rounded-lg border border-border/50 hover:bg-muted"
          >
            ✕
          </button>
        </div>

        {/* Source Attribution */}
        <div className="flex items-center justify-between text-[11px] bg-muted/30 px-3 py-2 rounded-lg border border-border/60 mb-5">
          <span className="text-muted-foreground font-medium flex items-center gap-1.5">
            🛰️ <strong className="text-foreground">Meteorological Source:</strong> {source}
          </span>
          <span className="text-xs font-semibold text-primary">
            Score: {plantingConditions.suitabilityScore}/100
          </span>
        </div>

        {/* Historical vs Current Year Comparison Table */}
        <div className="mb-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            📊 Historical Baseline vs Current Year Comparison
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Rainfall Box */}
            <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  🌧️ Annual Rainfall
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    comp.rainfallDeltaPercent >= 0
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : 'bg-amber-500/15 text-amber-600'
                  }`}
                >
                  {comp.rainfallDeltaPercent >= 0 ? '+' : ''}
                  {comp.rainfallDeltaPercent}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground block">
                    {historicalYearRange}
                  </span>
                  <span className="text-base font-bold text-foreground">
                    {historical.annualRainfallMm.toLocaleString()}{' '}
                    <span className="text-xs font-normal">mm</span>
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">
                    Current Year ({currentYear})
                  </span>
                  <span className="text-base font-bold text-foreground">
                    {current.annualRainfallMm.toLocaleString()}{' '}
                    <span className="text-xs font-normal">mm</span>
                  </span>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                Delta:{' '}
                {comp.rainfallDeltaMm >= 0 ? `+${comp.rainfallDeltaMm}` : comp.rainfallDeltaMm} mm
              </div>
            </div>

            {/* Temperature Box */}
            <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  🌡️ Mean Annual Temperature
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    comp.temperatureDeltaC <= 1.0
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : 'bg-red-500/15 text-red-600'
                  }`}
                >
                  {comp.temperatureDeltaC >= 0 ? '+' : ''}
                  {comp.temperatureDeltaC} °C
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground block">
                    {historicalYearRange}
                  </span>
                  <span className="text-base font-bold text-foreground">
                    {historical.meanTemperatureC.toFixed(1)}{' '}
                    <span className="text-xs font-normal">°C</span>
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">
                    Current Year ({currentYear})
                  </span>
                  <span className="text-base font-bold text-foreground">
                    {current.meanTemperatureC.toFixed(1)}{' '}
                    <span className="text-xs font-normal">°C</span>
                  </span>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                Delta:{' '}
                {comp.temperatureDeltaC >= 0
                  ? `+${comp.temperatureDeltaC}`
                  : comp.temperatureDeltaC}{' '}
                °C
              </div>
            </div>
          </div>
        </div>

        {/* Ecologist and Sponsor Advisories */}
        <div className="space-y-3 mb-5">
          {/* Ecologist Section */}
          <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                🌿 Ecologist Planting Assessment
              </span>
              <span className="text-[10px] text-muted-foreground">
                Optimal Window: {plantingConditions.recommendedPlantingWindow}
              </span>
            </div>
            <p className="text-muted-foreground leading-relaxed text-[11px]">
              {plantingConditions.ecologicalSummary}
            </p>
          </div>

          {/* Sponsor Section */}
          <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 text-xs">
            <span className="font-bold text-primary flex items-center gap-1 mb-1">
              💼 Sponsor Impact & Carbon Viability
            </span>
            <p className="text-muted-foreground leading-relaxed text-[11px]">
              {plantingConditions.sponsorSummary}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-border flex items-center justify-end">
          <Button variant="default" size="sm" onClick={onClose} className="text-xs">
            Close Deep Dive
          </Button>
        </div>
      </div>
    </div>
  );
}
