'use client';

import * as React from 'react';
import Image from 'next/image';
import { BookOpen, Sprout, Video } from 'lucide-react';

import { Badge } from '@/components/atoms/Badge';
import { Card } from '@/components/molecules/Card';
import { Text } from '@/components/atoms/Text';
import { getPlantingMethodsForProject, type PlantingMethod } from '@/lib/plantingMethods';

interface PlantingMethodsProps {
  projectId: string;
  /** Optional override for tests/storybook; otherwise resolved from the catalogue. */
  methods?: PlantingMethod[];
}

export function PlantingMethods({ projectId, methods }: PlantingMethodsProps) {
  const resolvedMethods = React.useMemo(
    () => methods ?? getPlantingMethodsForProject(projectId),
    [methods, projectId]
  );

  if (resolvedMethods.length === 0) {
    return (
      <Card className="p-6 border-stellar-green/10">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Sprout size={18} />
          Planting method documentation for this project is being prepared by the field team.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="planting-methods-section">
      <div className="grid gap-6 md:grid-cols-2">
        {resolvedMethods.map((method) => (
          <Card key={method.id} className="p-6 space-y-4 border-stellar-green/10">
            <div className="flex items-start justify-between gap-3">
              <Text variant="h4" className="font-bold flex items-center gap-2">
                <Sprout size={18} className="text-stellar-green" />
                {method.name}
              </Text>
              <Badge
                variant="secondary"
                className="bg-stellar-green/10 text-stellar-green border-stellar-green/20 shrink-0"
              >
                {method.coveragePercent}% of area
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">{method.description}</p>

            <ol className="space-y-1.5 text-sm">
              {method.steps.map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stellar-blue/10 text-xs font-semibold text-stellar-blue">
                    {index + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>

            {method.media.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {method.media.map((item) => (
                  <figure key={item.url} className="relative overflow-hidden rounded-lg">
                    {item.type === 'photo' ? (
                      <div className="relative aspect-video">
                        <Image
                          src={item.url}
                          alt={item.caption}
                          fill
                          sizes="(max-width: 768px) 100vw, 300px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <video
                        src={item.url}
                        controls
                        preload="none"
                        aria-label={item.caption}
                        className="aspect-video w-full rounded-lg bg-stellar-navy object-cover"
                      />
                    )}
                    <figcaption className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      {item.type === 'video' && <Video size={12} />}
                      {item.caption}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}

            <a
              href={method.rationaleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm transition-colors hover:border-stellar-blue/50"
            >
              <BookOpen size={16} className="mt-0.5 shrink-0 text-stellar-blue" />
              <span>
                <span className="font-medium text-foreground">Scientific rationale. </span>
                <span className="text-muted-foreground">{method.rationaleSummary}</span>
                <span className="ml-1 text-stellar-blue underline">Read the source</span>
              </span>
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}
