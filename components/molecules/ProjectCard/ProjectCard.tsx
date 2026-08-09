import * as React from 'react';
import Image from 'next/image';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/molecules/Card';
import { MapPin, ImageOff } from 'lucide-react';
import type { CarbonProject } from '@/lib/types/carbon';

export interface ProjectCardProps {
  project: CarbonProject;
}

const typeConfig: Record<string, { label: string; colorClass: string }> = {
  Reforestation: { label: 'Reforestation', colorClass: 'bg-stellar-green' },
  'Renewable Energy': {
    label: 'Renewable Energy',
    colorClass: 'bg-stellar-cyan text-stellar-navy',
  },
  'Mangrove Restoration': { label: 'Mangrove Restoration', colorClass: 'bg-stellar-purple' },
  'Sustainable Agriculture': { label: 'Sustainable Agriculture', colorClass: 'bg-stellar-purple' },
  Conservation: { label: 'Conservation', colorClass: 'bg-stellar-purple' },
};

export function ProjectCard({ project }: ProjectCardProps) {
  const badgeConfig = typeConfig[project.type] ?? {
    label: project.type,
    colorClass: 'bg-stellar-purple',
  };

  const isSoldOut = project.isOutOfStock || project.availableSupply <= 0;

  return (
    <Card className="overflow-hidden flex flex-col hover:shadow-lg transition-shadow">
      <CardHeader className="p-0 relative">
        <div className="relative w-full h-48 bg-secondary/50">
          {(project as any).imageUrl ? (
            <Image
              src={(project as any).imageUrl}
              alt={project.name}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground">
              <ImageOff className="h-10 w-10 mb-2 opacity-50" />
              <Text variant="small">No image available</Text>
            </div>
          )}

          <div className="absolute top-3 right-3 z-10">
            <Badge className={`border-none ${badgeConfig.colorClass}`}>{badgeConfig.label}</Badge>
          </div>

          {project.isOutOfStock && (
            <div className="absolute top-3 left-3 z-10">
              <Badge variant="outline" className="bg-background/80 backdrop-blur">
                Out of Stock
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-4 flex-grow flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <Text variant="h4" as="h3" className="font-semibold leading-tight">
            {project.name}
          </Text>
        </div>

        <div className="flex items-center gap-1 text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          <Text variant="small" as="span" className="text-xs">
            {project.location}
          </Text>
        </div>

        <Text variant="muted" className="line-clamp-2 text-sm">
          {project.description}
        </Text>

        <div className="mt-auto pt-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <Text variant="small" as="span" className="text-muted-foreground text-xs">
              Price per Ton
            </Text>
            <Text variant="small" as="span" className="font-semibold">
              ${project.pricePerTon.toFixed(2)}
            </Text>
          </div>
          <div className="flex items-center justify-between">
            <Text variant="small" as="span" className="text-muted-foreground text-xs">
              Available
            </Text>
            <Text variant="small" as="span">
              {project.availableSupply.toFixed(2)} tons
            </Text>
          </div>
          <div className="flex items-center justify-between">
            <Text variant="small" as="span" className="text-muted-foreground text-xs">
              Vintage
            </Text>
            <Text variant="small" as="span">
              {project.vintageYear}
            </Text>
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-5 pt-4 border-t bg-muted/20 flex items-center justify-between flex-none gap-3">
        <div className="flex flex-col">
          <Text variant="small" className="text-muted-foreground text-xs leading-tight">
            Price
          </Text>
          <div className="flex items-baseline gap-1">
            <Text variant="h4">${project.pricePerTon.toFixed(2)}</Text>
            <Text variant="small" className="text-muted-foreground text-xs">
              /ton
            </Text>
          </div>
        </div>

        <Button stellar="primary" disabled={isSoldOut} className="w-full sm:w-auto font-semibold">
          {isSoldOut ? 'Sold Out' : 'Donate'}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default ProjectCard;
