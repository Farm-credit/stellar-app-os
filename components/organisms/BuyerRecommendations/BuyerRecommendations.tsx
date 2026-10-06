'use client';

/**
 * Buyer recommendation engine — project suggestions (Issue #1430)
 *
 * Lets a buyer describe their company (industry, size, budget, co-benefit
 * preferences, past purchases) and shows the best-matching offset projects
 * with a match score, a per-signal breakdown and the reasons behind each pick.
 * Scoring comes from the pure engine in `@/lib/marketplace/buyerRecommendations`,
 * the same one served by `POST /api/v2/marketplace/recommendations`.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Sparkles, SearchX } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { Text } from '@/components/atoms/Text';
import {
  CO_BENEFITS,
  COMPANY_SIZES,
  INDUSTRIES,
  recommendProjects,
  SIGNAL_WEIGHTS,
  type BuyerProfile,
  type CoBenefit,
  type CompanySize,
  type Industry,
  type Signal,
} from '@/lib/marketplace/buyerRecommendations';
import type { CarbonProject } from '@/lib/types/carbon';

export interface BuyerRecommendationsProps {
  projects: readonly CarbonProject[];
}

const INDUSTRY_OPTIONS: Record<Industry, string> = {
  technology: 'Technology',
  finance: 'Financial services',
  manufacturing: 'Manufacturing',
  energy: 'Energy',
  agriculture_food: 'Agriculture & food',
  retail_consumer: 'Retail & consumer goods',
  transport_logistics: 'Transport & logistics',
  other: 'Other',
};

const SIZE_OPTIONS: Record<CompanySize, string> = {
  startup: 'Startup (< 50 employees)',
  sme: 'SME (50–1,000 employees)',
  enterprise: 'Enterprise (1,000+ employees)',
};

const SIGNAL_LABELS: Record<Signal, string> = {
  industry: 'Industry fit',
  coBenefits: 'Co-benefits',
  budget: 'Budget',
  size: 'Company size',
  history: 'Purchase history',
};

function coBenefitLabel(benefit: CoBenefit): string {
  const label = benefit.replace('_', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const fieldClass =
  'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function BuyerRecommendations({ projects }: BuyerRecommendationsProps) {
  const [industry, setIndustry] = useState<Industry>('technology');
  const [companySize, setCompanySize] = useState<CompanySize>('sme');
  const [budgetUsd, setBudgetUsd] = useState(5_000);
  const [preferences, setPreferences] = useState<CoBenefit[]>(['biodiversity']);
  const [pastProjectIds, setPastProjectIds] = useState<string[]>([]);

  const profile: BuyerProfile = useMemo(
    () => ({
      industry,
      companySize,
      budgetUsd,
      coBenefitPreferences: preferences,
      // The form only records *which* projects were bought; weight them equally.
      pastPurchases: pastProjectIds.map((projectId) => ({ projectId, tonnes: 1 })),
    }),
    [industry, companySize, budgetUsd, preferences, pastProjectIds]
  );
  const { recommendations, excluded } = useMemo(
    () => recommendProjects(profile, projects, 3),
    [profile, projects]
  );

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return (
    <section className="space-y-8">
      <header className="flex flex-col gap-2">
        <Text variant="h1" className="flex items-center gap-3 text-foreground">
          <Sparkles className="h-8 w-8 text-stellar-green" aria-hidden />
          Recommended projects
        </Text>
        <Text variant="muted" as="p" className="max-w-2xl">
          Tell us about your company and we&apos;ll match you with offset projects based on your
          industry, size, budget, preferred co-benefits and what you&apos;ve bought before.
        </Text>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <label className="block text-sm font-medium">
              Industry
              <select
                className={fieldClass}
                value={industry}
                onChange={(event) => setIndustry(event.target.value as Industry)}
              >
                {INDUSTRIES.map((value) => (
                  <option key={value} value={value}>
                    {INDUSTRY_OPTIONS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium">
              Company size
              <select
                className={fieldClass}
                value={companySize}
                onChange={(event) => setCompanySize(event.target.value as CompanySize)}
              >
                {COMPANY_SIZES.map((value) => (
                  <option key={value} value={value}>
                    {SIZE_OPTIONS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium">
              Budget (USD)
              <input
                type="number"
                min={1}
                step={100}
                className={fieldClass}
                value={budgetUsd}
                onChange={(event) => setBudgetUsd(Math.max(0, Number(event.target.value) || 0))}
              />
            </label>

            <fieldset>
              <legend className="text-sm font-medium">Preferred co-benefits</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {CO_BENEFITS.map((benefit) => {
                  const selected = preferences.includes(benefit);
                  return (
                    <button
                      key={benefit}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setPreferences((current) => toggle(current, benefit))}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        selected
                          ? 'border-stellar-green bg-stellar-green/10 text-foreground'
                          : 'border-input text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {coBenefitLabel(benefit)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium">Projects you&apos;ve bought before</legend>
              <div className="mt-2 space-y-2">
                {projects.map((project) => (
                  <label key={project.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pastProjectIds.includes(project.id)}
                      onChange={() => setPastProjectIds((current) => toggle(current, project.id))}
                    />
                    {project.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        <div className="space-y-4" aria-live="polite">
          {recommendations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <SearchX className="h-10 w-10 text-muted-foreground" aria-hidden />
                <Text variant="h4">No projects match this budget yet</Text>
                <Text variant="muted" as="p">
                  Every available project costs more than your budget per tonne. Raise the budget to
                  see suggestions.
                </Text>
              </CardContent>
            </Card>
          ) : (
            recommendations.map((recommendation, index) => (
              <Card key={recommendation.project.id}>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                  <div className="space-y-1.5">
                    <Text variant="label">#{index + 1} match</Text>
                    <CardTitle className="text-xl">
                      <Link
                        href={`/projects/${recommendation.project.id}`}
                        className="hover:underline"
                      >
                        {recommendation.project.name}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {recommendation.project.type} · {recommendation.project.location} ·{' '}
                      {recommendation.project.verificationStatus}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <Text variant="h3" className="text-stellar-green">
                      {recommendation.score}
                    </Text>
                    <Text variant="label">match score</Text>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recommendation.reasons.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {recommendation.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}

                  <dl className="grid gap-2 sm:grid-cols-5">
                    {(Object.keys(SIGNAL_WEIGHTS) as Signal[]).map((signal) => (
                      <div key={signal}>
                        <dt className="text-xs text-muted-foreground">{SIGNAL_LABELS[signal]}</dt>
                        <dd className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-stellar-green"
                            style={{
                              width: `${Math.round(recommendation.breakdown[signal] * 100)}%`,
                            }}
                          />
                          <span className="sr-only">
                            {Math.round(recommendation.breakdown[signal] * 100)}%
                          </span>
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <Text variant="small" className="text-muted-foreground">
                    Suggested purchase:{' '}
                    <strong className="text-foreground">
                      {recommendation.suggestedTonnes.toLocaleString('en-US')}t
                    </strong>{' '}
                    for {usd.format(recommendation.estimatedCostUsd)} at $
                    {recommendation.project.pricePerTon.toFixed(2)}/t
                  </Text>
                </CardContent>
              </Card>
            ))
          )}

          {excluded.length > 0 && (
            <Text variant="muted" as="p">
              {excluded.length} project{excluded.length === 1 ? ' was' : 's were'} left out:{' '}
              {[
                excluded.some((item) => item.reason === 'out_of_stock') && 'sold out',
                excluded.some((item) => item.reason === 'over_budget') &&
                  'one tonne costs more than your budget',
              ]
                .filter(Boolean)
                .join(', or ')}
              .
            </Text>
          )}
        </div>
      </div>
    </section>
  );
}
