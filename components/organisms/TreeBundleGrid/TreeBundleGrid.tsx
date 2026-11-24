'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { BundleCard } from '@/components/molecules/BundleCard';
import type { TreeBundle } from '@/lib/types/tree-bundle';

export interface TreeBundleGridProps extends HTMLAttributes<HTMLElement> {
  bundles: TreeBundle[];
  /** Optional heading rendered above the grid. Defaults to "Curated Tree Bundles". */
  heading?: string;
  /** Optional sub-heading rendered below the main heading. */
  subheading?: string;
}

/**
 * TreeBundleGrid — organism that renders a responsive grid of BundleCard molecules.
 *
 * Intended for the /bundles browse page and any page section that showcases
 * curated bundles (e.g. the landing page).
 */
const TreeBundleGrid = forwardRef<HTMLElement, TreeBundleGridProps>(
  (
    {
      bundles,
      heading = 'Curated Tree Bundles',
      subheading = 'Save when you sponsor multiple species at once — every tree gets its own trackable ID.',
      className,
      ...props
    },
    ref
  ) => {
    if (bundles.length === 0) {
      return (
        <section
          ref={ref}
          className={cn('py-12 text-center text-muted-foreground', className)}
          aria-label="Tree bundles"
          {...props}
        >
          No bundles available at the moment.
        </section>
      );
    }

    return (
      <section
        ref={ref}
        className={cn('w-full', className)}
        aria-labelledby="bundle-grid-heading"
        {...props}
      >
        {/* Section header */}
        <div className="mb-8 text-center">
          <h2
            id="bundle-grid-heading"
            className="text-3xl font-bold tracking-tight text-foreground"
          >
            {heading}
          </h2>
          {subheading && (
            <p className="mt-2 max-w-2xl mx-auto text-muted-foreground text-base leading-relaxed">
              {subheading}
            </p>
          )}
        </div>

        {/* Responsive grid */}
        <ul
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Available tree bundles"
        >
          {bundles.map((bundle) => (
            <li key={bundle.id} className="flex">
              <BundleCard bundle={bundle} className="w-full" />
            </li>
          ))}
        </ul>

        {/* Accessibility note about individual tree IDs */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Every tree in a bundle is assigned a unique, trackable Tree ID after checkout. You can
          follow each tree&apos;s growth on its own profile page.
        </p>
      </section>
    );
  }
);
TreeBundleGrid.displayName = 'TreeBundleGrid';

export { TreeBundleGrid };
