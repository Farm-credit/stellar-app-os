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

  const handleToggle = (projectId: string) => {
    const alreadyFavorited = isFavorited(projectId);

    toggleFavorite(projectId);

    toast(
      alreadyFavorited
        ? `${project.name} removed from favorites`
        : `${project.name} added to favorites!`,
      {
        action: {
          label: 'Undo',
          onClick: () => undoRemove(),
        },
      }
    );
  };
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4 hover:shadow-lg transition-shadow">
      <div className="flex justify-end">
        <button
          onClick={() => handleToggle(project.id)}
          aria-label={isFavorited(project.id) ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={isFavorited(project.id)}
        >
          <HeartIcon
            className={
              isFavorited(project.id) ? 'fill-red-500 stroke-red-500' : 'fill-none stroke-current'
            }
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
      <div>
        <div className="flex items-start justify-between mb-2">
          <Text variant="h4" as="h3" className="font-semibold">
            {project.name}
          </Text>
          {project.isOutOfStock && (
            <Badge variant="outline" className="ml-2">
              Out of Stock
            </Badge>
          )}
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
      </div>

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
        <div className="flex items-center justify-between">
          <Text variant="small" as="span" className="text-muted-foreground">
            Price per Ton
          </Text>
          <Text variant="small" as="span" className="font-semibold">
            ${project.pricePerTon.toFixed(2)}
          </Text>
        </div>
        <div className="flex items-center justify-between">
          <Text variant="small" as="span" className="text-muted-foreground">
            Available
          </Text>
          <Text variant="small" as="span">
            {project.availableSupply.toFixed(2)} tons
          </Text>
        </div>
      </div>

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
