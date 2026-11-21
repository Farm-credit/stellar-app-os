'use client';

import { useState } from 'react';
import {
  Award,
  Calendar,
  Globe2,
  RotateCcw,
  Sliders,
  Sparkles,
  Sprout,
  TreePine,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/molecules/Card';
import { Badge } from '@/components/atoms/Badge';
import { LiveCounter } from '@/components/atoms/LiveCounter';
import {
  calculateSocialImpactScore,
  type ImpactScoreFactor,
  type SocialImpactScoreResult,
} from '@/lib/impact/social-impact-score';
import { cn } from '@/lib/utils';

interface SocialImpactScoreProps {
  initialScore: SocialImpactScoreResult;
  _sponsorAddress?: string;
  className?: string;
}

export function SocialImpactScore({
  initialScore,
  _sponsorAddress,
  className,
}: SocialImpactScoreProps) {
  const [showSimulator, setShowSimulator] = useState(false);

  // Simulation offsets
  const [additionalTrees, setAdditionalTrees] = useState(0);
  const [additionalSpecies, setAdditionalSpecies] = useState(0);
  const [additionalRegions, setAdditionalRegions] = useState(0);
  const [additionalYears, setAdditionalYears] = useState(0);

  const isSimulating =
    additionalTrees > 0 || additionalSpecies > 0 || additionalRegions > 0 || additionalYears > 0;

  // Derive current reactive score result
  const currentScore: SocialImpactScoreResult = isSimulating
    ? calculateSocialImpactScore({
        treesFunded: initialScore.factors.treesFunded.rawValue + additionalTrees,
        speciesCount: initialScore.factors.speciesDiversity.rawValue + additionalSpecies,
        regionsCount: initialScore.factors.geographicSpread.rawValue + additionalRegions,
        yearsOfEngagement: initialScore.factors.yearsOfEngagement.rawValue + additionalYears,
      })
    : initialScore;

  const handleReset = () => {
    setAdditionalTrees(0);
    setAdditionalSpecies(0);
    setAdditionalRegions(0);
    setAdditionalYears(0);
  };

  const factorIcons: Record<string, React.ReactNode> = {
    treesFunded: <TreePine className="h-5 w-5 text-emerald-500" aria-hidden="true" />,
    speciesDiversity: <Sprout className="h-5 w-5 text-teal-500" aria-hidden="true" />,
    geographicSpread: <Globe2 className="h-5 w-5 text-sky-500" aria-hidden="true" />,
    yearsOfEngagement: <Calendar className="h-5 w-5 text-indigo-500" aria-hidden="true" />,
  };

  const factorBarColors: Record<string, string> = {
    treesFunded: 'bg-emerald-500',
    speciesDiversity: 'bg-teal-500',
    geographicSpread: 'bg-sky-500',
    yearsOfEngagement: 'bg-indigo-500',
  };

  const tierBadgeVariant = (tierColor: SocialImpactScoreResult['tierColor']) => {
    switch (tierColor) {
      case 'purple':
        return 'accent' as const;
      case 'emerald':
        return 'success' as const;
      case 'sky':
        return 'default' as const;
      case 'amber':
      default:
        return 'secondary' as const;
    }
  };

  return (
    <section aria-labelledby="social-impact-score-heading" className={cn('space-y-6', className)}>
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <CardHeader className="border-b border-slate-100 bg-slate-50/60 p-6 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                <h2
                  id="social-impact-score-heading"
                  className="text-xl font-bold tracking-tight text-slate-900 dark:text-white"
                >
                  Social Impact Score
                </h2>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Personalised ecological rating measuring tree scale, biodiversity, and stewardship.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSimulator((prev) => !prev)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                  showSimulator
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                )}
                aria-expanded={showSimulator}
              >
                <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
                {showSimulator ? 'Close Impact Simulator' : 'Simulate Growth'}
              </button>

              {isSimulating && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  title="Reset simulator"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reset
                </button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 md:p-8 space-y-8">
          {/* Main Score & Tier Banner */}
          <div className="grid gap-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent p-6 border border-emerald-100 dark:border-emerald-900/30 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={tierBadgeVariant(currentScore.tierColor)}
                  className="px-3 py-1 text-xs"
                >
                  <Award className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Tier {currentScore.tierLevel}: {currentScore.tier}
                </Badge>
                {isSimulating && (
                  <Badge
                    variant="outline"
                    className="text-xs border-amber-500 text-amber-600 dark:text-amber-400"
                  >
                    Live Simulated Preview
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                {currentScore.tierDescription}
              </p>
            </div>

            <div className="flex flex-col items-start lg:items-end justify-center">
              <div className="flex items-baseline gap-1.5">
                <span
                  data-testid="impact-score-value"
                  className="text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white"
                >
                  <LiveCounter value={currentScore.totalScore} duration={800} />
                </span>
                <span className="text-lg font-medium text-slate-500 dark:text-slate-400">
                  / {currentScore.maxScore}
                </span>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mt-1">
                Total Score
              </span>
            </div>
          </div>

          {/* Interactive Impact Simulator Tray */}
          {showSimulator && (
            <div
              data-testid="impact-simulator-panel"
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/60 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  Interactive Impact Simulator
                </h4>
                <span className="text-xs text-slate-500">
                  Test score impact by simulating additional contributions
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Additional Trees */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="sim-trees"
                    className="text-xs font-medium text-slate-600 dark:text-slate-300"
                  >
                    + Trees Sponsored ({additionalTrees})
                  </label>
                  <input
                    id="sim-trees"
                    type="range"
                    min="0"
                    max="500"
                    step="10"
                    value={additionalTrees}
                    onChange={(e) => setAdditionalTrees(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                  <div className="flex gap-1">
                    {[10, 50, 100].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => setAdditionalTrees((prev) => prev + step)}
                        className="rounded bg-white px-2 py-0.5 text-[11px] font-medium border text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                      >
                        +{step}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Additional Species */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="sim-species"
                    className="text-xs font-medium text-slate-600 dark:text-slate-300"
                  >
                    + Species Diversity ({additionalSpecies})
                  </label>
                  <input
                    id="sim-species"
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={additionalSpecies}
                    onChange={(e) => setAdditionalSpecies(Number(e.target.value))}
                    className="w-full accent-teal-600"
                  />
                  <div className="flex gap-1">
                    {[1, 3, 5].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => setAdditionalSpecies((prev) => Math.min(10, prev + step))}
                        className="rounded bg-white px-2 py-0.5 text-[11px] font-medium border text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                      >
                        +{step}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Additional Regions */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="sim-regions"
                    className="text-xs font-medium text-slate-600 dark:text-slate-300"
                  >
                    + Geographic Regions ({additionalRegions})
                  </label>
                  <input
                    id="sim-regions"
                    type="range"
                    min="0"
                    max="5"
                    step="1"
                    value={additionalRegions}
                    onChange={(e) => setAdditionalRegions(Number(e.target.value))}
                    className="w-full accent-sky-600"
                  />
                  <div className="flex gap-1">
                    {[1, 2, 4].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => setAdditionalRegions((prev) => Math.min(5, prev + step))}
                        className="rounded bg-white px-2 py-0.5 text-[11px] font-medium border text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                      >
                        +{step}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Additional Years */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="sim-years"
                    className="text-xs font-medium text-slate-600 dark:text-slate-300"
                  >
                    + Years Active ({additionalYears} yrs)
                  </label>
                  <input
                    id="sim-years"
                    type="range"
                    min="0"
                    max="3"
                    step="0.5"
                    value={additionalYears}
                    onChange={(e) => setAdditionalYears(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex gap-1">
                    {[0.5, 1, 2].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => setAdditionalYears((prev) => Math.min(3, prev + step))}
                        className="rounded bg-white px-2 py-0.5 text-[11px] font-medium border text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                      >
                        +{step}y
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Breakdown of 4 Contributing Factors */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Contributing Factors Breakdown
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              {Object.values(currentScore.factors).map((factor: ImpactScoreFactor) => (
                <div
                  key={factor.id}
                  data-testid={`factor-card-${factor.id}`}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/40 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-xl bg-slate-100 p-2 dark:bg-slate-800">
                        {factorIcons[factor.id]}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {factor.label}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {factor.description}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        <LiveCounter value={factor.score} duration={800} />
                      </span>
                      <span className="text-xs text-slate-500"> / {factor.maxScore}</span>
                    </div>
                  </div>

                  {/* Progress Bar with smooth animation */}
                  <div className="space-y-1">
                    <div
                      role="progressbar"
                      aria-valuenow={factor.score}
                      aria-valuemin={0}
                      aria-valuemax={factor.maxScore}
                      aria-label={`${factor.label} progress`}
                      className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                    >
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-700 ease-out',
                          factorBarColors[factor.id]
                        )}
                        style={{ width: `${Math.min(100, Math.max(0, factor.percentage))}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        Current: {factor.rawValue} {factor.unit}
                      </span>
                      <span>
                        Target: {factor.targetValue} {factor.unit} ({factor.percentage}%)
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actionable Recommendations */}
          {currentScore.tips.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/30 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Actionable Growth Tips
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                {currentScore.tips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
