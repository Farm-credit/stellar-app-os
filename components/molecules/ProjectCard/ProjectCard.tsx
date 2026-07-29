import * as React from 'react';
import Image from 'next/image';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/molecules/Card';
import { MapPin, ImageOff } from 'lucide-react';

export interface ProjectCardProps {
  id: string | number;
  title: string;
  location: string;
  description: string;
  imageUrl: string | null;
  type: 'reforestation' | 'renewable' | 'conservation';
  progress: number;
  price: number;
  availableCredits: number;
}

const typeConfig = {
  reforestation: { label: 'Reforestation', colorClass: 'bg-stellar-green' },
  renewable: { label: 'Renewable Energy', colorClass: 'bg-stellar-cyan text-stellar-navy' },
  conservation: { label: 'Conservation', colorClass: 'bg-stellar-purple' },
} as const;

export function ProjectCard({
  title,
  location,
  description,
  imageUrl,
  type,
  progress,
  price,
  availableCredits,
}: ProjectCardProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const badgeConfig = typeConfig[type];
  const isSoldOut = availableCredits <= 0;

  return (
    <Card className="h-full overflow-hidden">
      <div className="relative aspect-[16/10] bg-secondary/50">
        {imageUrl ? (
          <Image src={imageUrl} alt={title} fill className="object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground bg-secondary/50">
            <ImageOff className="mb-2 h-10 w-10 opacity-50" />
            <Text variant="small">No image available</Text>
          </div>
        )}
        <div className="absolute right-3 top-3 z-10">
          <Badge className={`border-none ${badgeConfig.colorClass}`}>{badgeConfig.label}</Badge>
        </div>
      </div>

      <CardHeader className="p-5 pb-3">
        <Text variant="h4" as="h3" className="font-semibold">
          {title}
        </Text>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span>{location}</span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-grow flex-col justify-between p-5 pt-0">
        <Text variant="muted" className="mb-4 line-clamp-3">
          {description}
        </Text>

        <div className="mt-auto space-y-2">
          <div className="flex items-end justify-between">
            <Text variant="small" className="font-medium">
              {clampedProgress}% Funded
            </Text>
            <Text variant="small" className="text-xs text-muted-foreground">
              {availableCredits > 0 ? `${availableCredits.toLocaleString()} credits left` : '0 credits left'}
            </Text>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-stellar-green transition-all duration-1000 ease-out"
              style={{ width: `${clampedProgress}%` }}
            />
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-3 border-t bg-muted/20 p-5">
        <div className="flex flex-col">
          <Text variant="small" className="text-xs leading-tight text-muted-foreground">
            Price
          </Text>
          <div className="flex items-baseline gap-1">
            <Text variant="h4">${price.toFixed(2)}</Text>
            <Text variant="small" className="text-xs text-muted-foreground">
              /unit
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
