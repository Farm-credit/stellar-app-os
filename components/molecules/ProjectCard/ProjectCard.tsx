'use client';

import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { HeartIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useFavorites } from '@/contexts/FavouritesContext';
import type { CarbonProject } from '@/lib/types/carbon';

export function ProjectCard({ project }: { project: CarbonProject }) {
  const { isFavorited, toggleFavorite, undoRemove } = useFavorites();

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
        </button>
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
        <Text variant="muted" as="p" className="text-sm">
          {project.description}
        </Text>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Text variant="small" as="span" className="text-muted-foreground">
            Type
          </Text>
          <Badge variant="default">{project.type}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <Text variant="small" as="span" className="text-muted-foreground">
            Location
          </Text>
          <Text variant="small" as="span">
            {project.location}
          </Text>
        </div>
        <div className="flex items-center justify-between">
          <Text variant="small" as="span" className="text-muted-foreground">
            Vintage Year
          </Text>
          <Text variant="small" as="span">
            {project.vintageYear}
          </Text>
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

      {project.coBenefits.length > 0 && (
        <div>
          <Text variant="small" as="span" className="text-muted-foreground block mb-2">
            Co-benefits
          </Text>
          <div className="flex flex-wrap gap-2">
            {project.coBenefits.map((benefit) => (
              <Badge
                key={benefit}
                variant="accent"
                className="bg-stellar-purple/10 text-stellar-purple border-stellar-purple/20"
              >
                {benefit}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="pt-4 border-t">
        <Badge variant="success">{project.verificationStatus}</Badge>
      </div>
    </div>
  );
}
