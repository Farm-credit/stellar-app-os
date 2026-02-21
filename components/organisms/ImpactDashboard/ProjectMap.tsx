/**
 * ProjectMap Molecule Component
 *
 * Interactive world map showing project locations with animated pins.
 * Includes detailed project cards and accessible list view.
 */

"use client";

import { useState } from "react";
import { TreePine, Zap, Waves, Shield, MapPin, Globe, X } from "lucide-react";
import { ProjectLocation } from "@/types/impact.types";

interface ProjectMapProps {
  projects: ProjectLocation[];
}

/**
 * Get icon for project type
 */
function getProjectIcon(type: ProjectLocation["type"]) {
  const icons = {
    reforestation: TreePine,
    "renewable-energy": Zap,
    "ocean-cleanup": Waves,
    conservation: Shield,
  };
  return icons[type] || MapPin;
}

/**
 * Get color scheme for project type
 */
function getProjectColors(type: ProjectLocation["type"]) {
  const colors = {
    reforestation: {
      bg: "bg-stellar-green",
      text: "text-white",
      ring: "ring-stellar-green/20",
      border: "border-stellar-green/30",
    },
    "renewable-energy": {
      bg: "bg-amber-500",
      text: "text-white",
      ring: "ring-amber-500/20",
      border: "border-amber-500/30",
    },
    "ocean-cleanup": {
      bg: "bg-stellar-cyan",
      text: "text-white",
      ring: "ring-stellar-cyan/20",
      border: "border-stellar-cyan/30",
    },
    conservation: {
      bg: "bg-stellar-purple",
      text: "text-white",
      ring: "ring-stellar-purple/20",
      border: "border-stellar-purple/30",
    },
  };
  return colors[type] || colors.reforestation;
}

export function ProjectMap({ projects }: ProjectMapProps) {
  const [selectedProject, setSelectedProject] =
    useState<ProjectLocation | null>(null);

  // Empty state
  if (!projects || projects.length === 0) {
    return (
      <div className="h-112.5 flex items-center justify-center bg-linear-to-br from-stellar-navy/5 to-stellar-blue/5 rounded-2xl border border-dashed border-border/50">
        <div className="text-center p-8">
          <Globe
            className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50"
            strokeWidth={1.5}
          />
          <p className="text-muted-foreground font-medium">
            No active projects yet. Check back soon!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Map Visualization */}
      <div className="relative h-112.5 bg-linear-to-br from-stellar-navy via-stellar-navy/95 to-stellar-blue/20 rounded-2xl overflow-hidden border border-border/50 shadow-xl">
        {/* Decorative grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Project pins */}
        <div className="absolute inset-0">
          {projects.map((project, index) => {
            // Simple lat/lng to x/y projection
            const x = ((project.lng + 180) / 360) * 100;
            const y = ((90 - project.lat) / 180) * 100;

            const Icon = getProjectIcon(project.type);
            const colors = getProjectColors(project.type);
            const isSelected = selectedProject?.id === project.id;

            return (
              <button
                key={project.id}
                onClick={() => setSelectedProject(isSelected ? null : project)}
                className={`
                  absolute transform -translate-x-1/2 -translate-y-1/2 
                  transition-all duration-300
                  ${isSelected ? "scale-125 z-20" : "scale-100 hover:scale-110 z-10"}
                `}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  animation: "fadeIn 0.6s ease-out",
                  animationDelay: `${index * 150}ms`,
                  animationFillMode: "backwards",
                }}
                aria-label={`View ${project.name}`}
              >
                {/* Pin */}
                <div
                  className={`${colors.bg} ${colors.text} p-3 rounded-full shadow-2xl ring-4 ${colors.ring}`}
                >
                  <Icon className="w-5 h-5" strokeWidth={2.5} />
                </div>

                {/* Animated pulse */}
                <div
                  className={`absolute inset-0 ${colors.bg} rounded-full opacity-40 animate-ping`}
                  style={{ animationDuration: "2.5s" }}
                />
              </button>
            );
          })}
        </div>

        {/* Selected project details card */}
        {selectedProject && (
          <div className="absolute bottom-6 left-6 right-6 bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl p-5 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-start gap-4">
              <div
                className={`${getProjectColors(selectedProject.type).bg} ${getProjectColors(selectedProject.type).text} p-3 rounded-xl shrink-0`}
              >
                {(() => {
                  const Icon = getProjectIcon(selectedProject.type);
                  return <Icon className="w-6 h-6" strokeWidth={2} />;
                })()}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-foreground mb-2 text-lg">
                  {selectedProject.name}
                </h4>
                <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                  {selectedProject.description}
                </p>
                {selectedProject.treesPlanted > 0 && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-stellar-green/10 text-stellar-green rounded-lg text-xs font-semibold">
                    <TreePine className="w-4 h-4" />
                    {selectedProject.treesPlanted.toLocaleString()} trees
                    planted
                  </div>
                )}
              </div>

              <button
                onClick={() => setSelectedProject(null)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Project list (accessible alternative) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project) => {
          const Icon = getProjectIcon(project.type);
          const colors = getProjectColors(project.type);

          return (
            <button
              key={project.id}
              onClick={() => setSelectedProject(project)}
              className={`
                text-left p-4 bg-card border border-border rounded-xl 
                hover:${colors.border} hover:shadow-md
                transition-all duration-200
              `}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`${colors.bg} ${colors.text} p-2 rounded-lg`}>
                  <Icon className="w-5 h-5" strokeWidth={2} />
                </div>
                <span className="text-sm font-bold text-foreground flex-1">
                  {project.name}
                </span>
              </div>
              {project.treesPlanted > 0 && (
                <p className="text-xs text-muted-foreground ml-11">
                  {project.treesPlanted.toLocaleString()} trees
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
