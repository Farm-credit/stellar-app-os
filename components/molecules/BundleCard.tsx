'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
} from '@/components/molecules/Card';
import type { TreeBundle } from '@/lib/types/tree-bundle';

export interface BundleCardProps extends HTMLAttributes<HTMLDivElement> {
  bundle: TreeBundle;
}

/**
 * BundleCard — molecule component that renders a curated tree bundle on the
 * sponsorship browse page.
 *
 * Displays:
 * - Bundle icon + gradient header
 * - Name, tagline, optional badge
 * - Species breakdown (slots)
 * - CO₂ / tree-count stats
 * - Discounted price with savings callout
 * - CTA to the bundle checkout page
 */
const BundleCard = forwardRef<HTMLDivElement, BundleCardProps>(
  ({ bundle, className, ...props }, ref) => {
    const savings = bundle.retailPriceUsd - bundle.bundlePriceUsd;

    return (
      <Card
        ref={ref}
        className={cn(
          'flex flex-col overflow-hidden transition-shadow hover:shadow-lg focus-within:ring-2 focus-within:ring-stellar-blue focus-within:ring-offset-2',
          className
        )}
        {...props}
      >
        {/* Gradient header */}
        <div
          className={cn(
            'relative flex items-center gap-3 bg-gradient-to-r px-5 py-4',
            bundle.gradientClass
          )}
          aria-hidden="false"
        >
          <span className="text-3xl leading-none" role="img" aria-label={bundle.name}>
            {bundle.icon}
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-lg font-bold text-white leading-tight">
              {bundle.name}
            </CardTitle>
            <CardDescription className="mt-0.5 text-sm text-white/80 leading-snug truncate">
              {bundle.tagline}
            </CardDescription>
          </div>
          {bundle.badge && (
            <Badge
              className="shrink-0 bg-white/20 text-white border-white/30 text-xs"
              aria-label={`Label: ${bundle.badge}`}
            >
              {bundle.badge}
            </Badge>
          )}
        </div>

        <CardContent className="flex flex-col gap-4 flex-1 pt-4">
          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {bundle.description}
          </p>

          {/* Species breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Included Species
            </h4>
            <ul className="space-y-1.5" aria-label="Species included in this bundle">
              {bundle.slots.map((slot) => (
                <li
                  key={`${slot.species}-${slot.region}`}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium">{slot.species}</span>
                  <span className="text-muted-foreground text-xs ml-2 truncate max-w-[8rem]">
                    ×{slot.quantity} · {slot.region}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-2" aria-label="Bundle statistics">
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-center">
              <p className="text-xl font-bold text-stellar-green">{bundle.treeCount}</p>
              <p className="text-xs text-muted-foreground">Trees</p>
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-center">
              <p className="text-xl font-bold text-stellar-blue">
                {bundle.totalCo2KgPerYear.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">kg CO₂/yr</p>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-0">
          {/* Pricing */}
          <div className="flex w-full items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground line-through">
                ${bundle.retailPriceUsd.toFixed(0)} retail
              </p>
              <p className="text-2xl font-bold text-foreground">
                ${bundle.bundlePriceUsd.toFixed(0)}
              </p>
            </div>
            <div className="text-right">
              <Badge variant="success" className="text-xs px-2 py-0.5">
                Save ${savings.toFixed(0)} ({bundle.discountPercent}% off)
              </Badge>
            </div>
          </div>

          {/* CTA */}
          <Button
            asChild
            stellar="primary"
            width="full"
            aria-label={`Sponsor the ${bundle.name} for $${bundle.bundlePriceUsd}`}
          >
            <Link href={`/bundles/${bundle.id}/checkout`}>Sponsor This Bundle</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }
);
BundleCard.displayName = 'BundleCard';

export { BundleCard };
