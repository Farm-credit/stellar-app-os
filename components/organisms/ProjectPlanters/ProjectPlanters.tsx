'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Users, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/molecules/Card';
import { Text } from '@/components/atoms/Text';
import { getPlantersByProject } from '@/lib/api/planters';
import type { PlanterProfile } from '@/lib/types/planter';

interface ProjectPlantersProps {
  projectId: string;
  projectName: string;
}

/**
 * "Meet the Planters" section for a project detail page. Surfaces the people
 * planting trees for a project and links to their full profiles so sponsors
 * can connect directly. (Issue #1150)
 */
export function ProjectPlanters({ projectId, projectName }: ProjectPlantersProps) {
  const planters: PlanterProfile[] = getPlantersByProject(projectId);

  if (planters.length === 0) return null;

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <Text variant="h3" className="flex items-center gap-2 font-bold">
          <Users className="h-5 w-5 text-stellar-green" aria-hidden />
          Meet the Planters
        </Text>
        <Link
          href="/planters"
          className="inline-flex items-center gap-1 text-sm font-semibold text-stellar-blue hover:underline"
        >
          View all planters <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {planters.map((planter) => (
          <Link
            key={planter.id}
            href={`/planters/${planter.slug}`}
            className="group block"
            aria-label={`View ${planter.fullName}'s profile`}
          >
            <Card className="overflow-hidden rounded-2xl border-stellar-blue/10 transition-all duration-300 hover:border-stellar-green/40 hover:shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 ring-stellar-green/20">
                    {planter.avatarUrl ? (
                      <Image
                        src={planter.avatarUrl}
                        alt={planter.fullName}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted font-bold text-muted-foreground">
                        {planter.fullName.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold group-hover:text-stellar-green">
                      {planter.fullName}
                    </div>
                    <Text variant="small" className="truncate text-muted-foreground">
                      {planter.role}
                    </Text>
                  </div>
                </div>
                <Text variant="small" className="mt-3 line-clamp-2 text-muted-foreground">
                  {planter.tagline}
                </Text>
                <div className="mt-3 text-xs font-medium text-stellar-green">
                  {planter.stats.treesPlanted.toLocaleString()} trees planted on {projectName}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
