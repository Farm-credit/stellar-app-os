'use client';

import { useState, useCallback } from 'react';
import type { CarbonProject } from '@/lib/types/carbon';
import { ProjectSelectionCard } from '@/components/molecules/ProjectSelectionCard';
import { ComparisonTable } from '@/components/molecules/ComparisonTable';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { generateComparisonPDF } from '@/lib/utils/pdf';

const MAX_COMPARISON = 3;

export interface ComparisonToolProps {
  projects: CarbonProject[];
  onAddToCart?: (_projectId: string) => void;
}

export function ComparisonTool({ projects, onAddToCart }: ComparisonToolProps) {
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  const handleSelectionChange = useCallback((projectId: string, selected: boolean) => {
    setSelectedProjectIds((prev: string[]) => {
      if (selected) {
        if (prev.length >= MAX_COMPARISON) {
          return prev;
        }
        return [...prev, projectId];
      }
      return prev.filter((id: string) => id !== projectId);
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedProjectIds([]);
  }, []);

  const handleExportPDF = useCallback(() => {
    const selectedProjects = projects.filter((p) => selectedProjectIds.includes(p.id));
    generateComparisonPDF(selectedProjects);
  }, [projects, selectedProjectIds]);

  const selectedProjects = projects.filter((p) => selectedProjectIds.includes(p.id));

  const availableProjects = projects.filter((p) => !p.isOutOfStock);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <Text variant="h3" as="h2">
              Select Projects to Compare
            </Text>
            <Text variant="muted" as="p" className="mt-1">
              Choose up to {MAX_COMPARISON} projects to compare side-by-side
            </Text>
          </div>
          <Text
            variant="small"
            as="span"
            className={
              selectedProjectIds.length >= MAX_COMPARISON
                ? 'text-stellar-blue font-semibold'
                : 'text-muted-foreground'
            }
            aria-live="polite"
          >
            {selectedProjectIds.length} / {MAX_COMPARISON} selected
          </Text>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableProjects.map((project) => (
            <ProjectSelectionCard
              key={project.id}
              project={project}
              isSelected={selectedProjectIds.includes(project.id)}
              onSelectionChange={handleSelectionChange}
              disabled={
                !selectedProjectIds.includes(project.id) &&
                selectedProjectIds.length >= MAX_COMPARISON
              }
            />
          ))}
        </div>
      </div>

      {selectedProjects.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Text variant="h3" as="h2">
              Comparison
            </Text>
            <div className="flex gap-2">
              <Button
                stellar="primary-outline"
                size="sm"
                onClick={handleClearSelection}
                aria-label="Clear all selections"
              >
                Clear Selection
              </Button>
              <Button
                stellar="primary"
                size="sm"
                onClick={handleExportPDF}
                aria-label="Export comparison as PDF"
              >
                Export as PDF
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <ComparisonTable projects={selectedProjects} onAddToCart={onAddToCart} />
          </div>
        </div>
      )}

      {selectedProjects.length === 0 && (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <Text variant="muted" as="p">
            Select projects above to start comparing
          </Text>
        </div>
      )}
    </div>
  );
}
