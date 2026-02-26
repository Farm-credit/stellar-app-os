'use client';

import { ProjectCard } from '@/app/projects/page';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { useFavorites } from '@/contexts/FavouritesContext';

import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { Heart } from 'lucide-react';
import Link from 'next/link';

export default function FavoritesPage() {
  const { favorites } = useFavorites();

  const favoritedProjects = mockCarbonProjects.filter((project) => favorites.includes(project.id));

  if (favoritedProjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
        <Heart className="w-12 h-12 stroke-current" />
        <Text variant="h4" as="h2">
          No favorites yet
        </Text>
        <Text variant="muted" as="p">
          Click the heart icon on any project to save it here.
        </Text>
        <Link href="/projects">
          <Button variant="outline" onClick={() => window.history.back()}>
            Back to Projects
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-6">
      <div>
        <Text variant="h3" as="h1">
          Favorites
        </Text>
        <Text variant="muted" as="p">
          {favoritedProjects.length} saved {favoritedProjects.length === 1 ? 'project' : 'projects'}
        </Text>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {favoritedProjects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}
