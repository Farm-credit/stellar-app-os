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
};

export function ProjectCard({
  id: _id,
  title,
  location,
  description,
  imageUrl,
  type,
  progress,
  price,
  availableCredits,
}: ProjectCardProps) {
  const isSoldOut = availableCredits <= 0;
  const clampedProgress = Math.min(Math.max(progress, 0), 100);
  const badgeConfig = typeConfig[type] || typeConfig.reforestation;

  return (
    <Card className="group overflow-hidden flex flex-col h-full transition-all duration-300 hover:shadow-md hover:border-stellar-blue/30">
      {/* Image Area */}
      <div className="relative h-48 w-full overflow-hidden bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground bg-secondary/50">
            <ImageOff className="h-10 w-10 mb-2 opacity-50" />
            <Text variant="small">No image available</Text>
          </div>
        )}

        {/* Type Badge */}
        <div className="absolute top-3 right-3 z-10">
          <Badge className={`border-none ${badgeConfig.colorClass}`}>{badgeConfig.label}</Badge>
        </div>
      </div>

      <CardHeader className="p-5 pb-3 flex-none">
        <div className="flex items-center space-x-1 text-muted-foreground mb-1.5">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
          <Text variant="small" className="truncate text-xs">
            {location}
          </Text>
        </div>
        <Text
          as="h3"
          variant="h4"
          className="line-clamp-1 group-hover:text-stellar-blue transition-colors"
        >
          {title}
        </Text>
      </CardHeader>

      <CardContent className="p-5 pt-0 flex-grow flex flex-col justify-between">
        <Text variant="muted" className="line-clamp-2 mb-4">
          {description}
        </Text>

        {/* Progress Area */}
        <div className="space-y-2 mt-auto">
          <div className="flex justify-between items-end">
            <Text variant="small" className="font-medium">
              {clampedProgress}% Funded
            </Text>
            <Text variant="small" className="text-xs text-muted-foreground">
              {availableCredits > 0
                ? `${availableCredits.toLocaleString()} credits left`
                : '0 credits left'}
            </Text>
          </div>

          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-stellar-green transition-all duration-1000 ease-out rounded-full"
              style={{ width: `${clampedProgress}%` }}
            />
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-5 pt-4 border-t bg-muted/20 flex items-center justify-between flex-none gap-3">
        <div className="flex flex-col">
          <Text variant="small" className="text-muted-foreground text-xs leading-tight">
            Price
          </Text>
          <div className="flex items-baseline gap-1">
            <Text variant="h4">${price.toFixed(2)}</Text>
            <Text variant="small" className="text-muted-foreground text-xs">
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
