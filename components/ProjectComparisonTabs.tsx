// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

'use client';

import React, { useState } from 'react';
import { Leaf, Layers } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TreeSponsorshipComparison } from '@/components/TreeSponsorshipComparison';
import { ProjectComparisonTool } from '@/components/ProjectComparisonTool';
import type { ComparisonCriterionId } from '@/lib/projectComparison';

interface ProjectComparisonTabsProps {
  initialProjectIds?: string[];
  initialCriteria?: ComparisonCriterionId[];
  defaultTab?: 'sponsorship' | 'carbon';
}

export function ProjectComparisonTabs({
  initialProjectIds = [],
  initialCriteria,
  defaultTab = 'sponsorship',
}: ProjectComparisonTabsProps) {
  const [activeTab, setActiveTab] = useState<'sponsorship' | 'carbon'>(defaultTab);

  return (
    <div className="space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as 'sponsorship' | 'carbon')}
        className="w-full"
      >
        <div className="flex items-center justify-between border-b pb-4 mb-6">
          <TabsList className="bg-muted/80 p-1 rounded-xl">
            <TabsTrigger
              value="sponsorship"
              className="rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs inline-flex items-center gap-2"
            >
              <Leaf className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Tree Sponsorship Offerings</span>
            </TabsTrigger>
            <TabsTrigger
              value="carbon"
              className="rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs inline-flex items-center gap-2"
            >
              <Layers className="w-4 h-4 text-primary" />
              <span>Carbon Offset Credits</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sponsorship" className="mt-0 focus-visible:outline-none">
          <TreeSponsorshipComparison
            initialProjectIds={initialProjectIds.length > 0 ? initialProjectIds : undefined}
          />
        </TabsContent>

        <TabsContent value="carbon" className="mt-0 focus-visible:outline-none">
          <ProjectComparisonTool
            initialProjectIds={initialProjectIds}
            initialCriteria={initialCriteria}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ProjectComparisonTabs;
