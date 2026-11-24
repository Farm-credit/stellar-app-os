'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Camera, Heart, Leaf, MapPin, TreePine, Wind } from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import { TreeStatusBadge } from '@/components/molecules/TreeStatusBadge';
import { TreeGrowthStageBadge } from '@/components/molecules/TreeGrowthStageBadge';
import { TreeLifecycleTimeline } from '@/components/organisms/TreeLifecycleTimeline';
import { deriveGrowthStage } from '@/lib/tree-growth/stages';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { Co2MethodologyLink } from '@/components/molecules/Co2MethodologyLink';
import { LegacyTierBadge } from '@/components/molecules/LegacyTierBadge';
import type { TreeSequestration } from '@/lib/carbon/ipcc-tier1';
import type { Tree } from '@/lib/types/tree';
import { speciesPathForName } from '@/lib/species/education';
import { TreeCo2Calculation } from './TreeCo2Calculation';
import { TreeImage } from './TreeImage';

interface TreeDetailProps {
  tree: Tree;
  /** IPCC Tier 1 estimate for this tree; its inputs are shown on the profile. */
  sequestration?: TreeSequestration;
}

/** Tree detail view for sponsors and map click-through (#532, #533). */
export function TreeDetail({ tree, sequestration }: TreeDetailProps) {
  const growthStage = deriveGrowthStage(tree);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <Link
        href="/impact"
        className="mb-6 inline-flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to live map
      </Link>

      <header className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <TreePine className="h-6 w-6 text-stellar-green" aria-hidden />
          <Text variant="h2" as="h1" className="text-2xl sm:text-3xl">
            {tree.treeId}
          </Text>
          <TreeStatusBadge status={tree.status} />
          <TreeGrowthStageBadge stage={growthStage} />
          <LegacyTierBadge sponsorName={tree.sponsorName} compact />
        </div>
        <Text variant="muted" as="p">
          {tree.projectName}
        </Text>
      </header>

      {tree.dedication?.trim() ? (
        <section
          aria-label="Tree dedication"
          className="mb-6 rounded-xl border border-rose-200 bg-rose-50/70 p-4 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100">
              <Heart
                className="h-5 w-5 fill-rose-500 text-rose-500"
                data-testid="dedication-heart-icon"
                aria-hidden="true"
              />
            </div>
            <div className="space-y-1">
              <Text variant="small" className="font-semibold uppercase tracking-wide text-rose-700">
                Dedicated with love
              </Text>
              <blockquote className="text-base font-medium leading-relaxed text-foreground">
                &ldquo;{tree.dedication.trim()}&rdquo;
              </blockquote>
              {tree.sponsorName?.trim() ? (
                <Text variant="muted" className="text-xs">
                  — {tree.sponsorName.trim()}
                </Text>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {tree.imageUrl ? (
        <div className="mb-4 overflow-hidden rounded-xl border border-border bg-muted">
          <TreeImage src={tree.imageUrl} alt={`Evidence photo for ${tree.treeId}`} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Leaf className="h-4 w-4 text-stellar-green" aria-hidden />
              Species
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-lg font-semibold">{tree.species}</Text>
            {speciesPathForName(tree.species) ? (
              <Link
                href={speciesPathForName(tree.species) as string}
                className="mt-1 inline-block text-sm text-stellar-blue hover:underline"
              >
                Learn about {tree.species}
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wind className="h-4 w-4 text-[#14B6E7]" aria-hidden />
              CO₂ offset
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-lg font-semibold">
              {sequestration
                ? `${sequestration.annualCo2Kg.toFixed(1)} kg / year`
                : `${tree.co2OffsetKgPerYear} kg / year`}
            </Text>
            <Co2MethodologyLink className="mt-1 inline-block" />
          </CardContent>
        </Card>

        {sequestration ? <TreeCo2Calculation sequestration={sequestration} /> : null}

        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-[#3E1BDB]" aria-hidden />
              Location
            </CardTitle>
            <CardDescription>Fuzzed coordinates — exact GPS is never shown.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <Text>{tree.region}</Text>
            <Text variant="muted" className="text-sm">
              {tree.lat.toFixed(2)}°, {tree.lng.toFixed(2)}°
            </Text>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Planting timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <TreeLifecycleTimeline tree={tree} />
          </CardContent>
        </Card>

        <Link
          href={`/trees/${tree.id}/timeline`}
          className="group flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted sm:col-span-2"
        >
          <span className="flex items-center gap-3">
            <Camera className="h-5 w-5 text-stellar-green" aria-hidden />
            <span>
              <span className="block font-semibold">Photo timeline</span>
              <span className="block text-sm text-muted-foreground">
                Month-by-month growth photos, milestones, and impact metrics.
              </span>
            </span>
          </span>
          <ArrowRight
            className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
    </div>
  );
}
