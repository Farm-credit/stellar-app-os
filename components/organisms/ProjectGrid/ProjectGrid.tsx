"use client";

import { useMemo } from "react";
import type { CarbonProject } from "@/lib/types/carbon";
import { ProjectCard } from "@/components/molecules/ProjectCard/ProjectCard";
import { ProjectCardSkeleton } from "@/components/molecules/ProjectCard/ProjectCardSkeleton";
import { ProjectListItem } from "@/components/molecules/ProjectListItem/ProjectListItem";
import { ProjectListItemSkeleton } from "@/components/molecules/ProjectListItem/ProjectListItemSkeleton";
import { ViewToggle } from "@/components/atoms/ViewToggle/ViewToggle";
import { Text } from "@/components/atoms/Text";
import { Button } from "@/components/atoms/Button";

export interface ProjectGridProps {
  projects: CarbonProject[];
  view: "grid" | "list";
  onViewChange: (view: "grid" | "list") => void;
  isLoading?: boolean;
}

// Map CarbonProject to ProjectCard/ProjectListItem props
function mapProjectToCardProps(project: CarbonProject) {
  // Determine type mapping
  let type: "reforestation" | "renewable" | "conservation" = "conservation";
  if (project.type === "Reforestation" || project.type === "Mangrove Restoration") {
    type = "reforestation";
  } else if (project.type === "Renewable Energy") {
    type = "renewable";
  }

  // Calculate progress (mock calculation based on available supply)
  const maxSupply = 2500;
  const progress = Math.min(100, Math.max(0, ((maxSupply - project.availableSupply) / maxSupply) * 100));

  return {
    id: project.id,
    title: project.name,
    location: project.location,
    description: project.description,
    imageUrl: null, // No images in mock data
    type,
    progress: Math.round(progress),
    price: project.pricePerTon,
    availableCredits: Math.round(project.availableSupply),
  };
}

export function ProjectGrid({ projects, view, onViewChange, isLoading = false }: ProjectGridProps) {
  const mappedProjects = useMemo(() => projects.map(mapProjectToCardProps), [projects]);

  // Show skeleton loading states
  if (isLoading) {
    return (
      <div>
        <div className="flex justify-end mb-6">
          <ViewToggle view={view} onViewChange={onViewChange} />
        </div>
        
        {view === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProjectListItemSkeleton key={i} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Show empty state
  if (mappedProjects.length === 0) {
    return (
      <div>
        <div className="flex justify-end mb-6">
          <ViewToggle view={view} onViewChange={onViewChange} />
        </div>
        
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <Text variant="h3" as="h2" className="mb-2">
            No projects found
          </Text>
          <Text variant="muted" as="p" className="mb-6 max-w-md">
            There are currently no carbon credit projects available. Check back later or adjust your filters.
          </Text>
          <Button stellar="primary">
            Clear filters
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-6">
        <ViewToggle view={view} onViewChange={onViewChange} />
      </div>

      {view === "grid" ? (
        <div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-300"
          style={{ opacity: 1 }}
        >
          {mappedProjects.map((project) => (
            <ProjectCard key={project.id} {...project} />
          ))}
        </div>
      ) : (
        <div 
          className="space-y-4 transition-opacity duration-300"
          style={{ opacity: 1 }}
        >
          {mappedProjects.map((project) => (
            <ProjectListItem key={project.id} {...project} />
          ))}
        </div>
      )}
    </div>
  );
}
