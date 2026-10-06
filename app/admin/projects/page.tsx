'use client';

import Link from 'next/link';
import { useMemo, ref, useState } from 'react';
import type { ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';

export default function AdminProjectsPage(): ReactNode {
  const [projectType, setProjectType] = useState('');
  const [location, setLocation] = useState('');
  const [coBenefits, setCoBenefits] = useState<string[]>([]);
  const [certification, setCertification] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredProjects = useMemo(() => {
    return mockAdminProjectDetails.filter((project) => {
      if (projectType && project.type !== projectType) return false;
      if (location && project.country !== location) return false;
      if (certification && project.certificationStandard !== certification) return false;
      if (coBenefits.length > 0) {
        const projectBenefits = project.coBenefits ?? [];
        if (!coBenefits.every((benefit) => projectBenefits.includes(benefit))) return false;
      }
      const price = project.pricePerTonne ?? 0;
      if (minPrice && price < Number(minPrice)) return false;
      if (maxPrice && price > Number(maxPrice)) return false;
      return true;
    });
  }, [projectType, location, coBenefits, certification, minPrice, maxPrice]);

  const projectTypes = useMemo(
    () => Array.from(new Set(mockAdminProjectDetails.map((p) => p.type))),
    []
  );
  const locations = useMemo(
    () => Array.from(new Set(mockAdminProjectDetails.map((p) => p.country))),
    []
  );
  const certifications = useMemo(
    () => Array.from(new Set(mockAdminProjectDetails.map((p) => p.certificationStandard))),
    []
  );

  const virtualizer = useVirtualizer({
    count: filteredProjects.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 180,
    overscan: 5,
  });

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 sm:py-10">
      <div className="mb-8">
        <Text as="h1" variant="h2" className="mb-2">
          Admin Projects
        </Text>
        <Text as="p" variant="muted">
          Open a project to manage editable fields, MRV documents, verification, issuance history,
          and activity logs.
        </Text>
      </div>

      <div ref={scrollRef} className="overflow-auto" style={{ height: '600px' }}>
        <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const project = filteredProjects[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <div className="p-2">
                  <Card>
                    <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle className="text-xl">{project.name}</CardTitle>
                        <CardDescription>
                          {project.id} • {project.country} • {project.type}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={project.verificationEnabled ? 'success' : 'secondary'}>
                          {project.verificationEnabled ? 'Verified' : 'Verification Off'}
                        </Badge>
                        <Badge variant="outline">{project.lifecycleStatus}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">{project.description}</p>
<Button asChild variant="primary" className="shrink-0">
                        <Link href={`/admin/projects/${project.id}`}>Open Detail View</Link>
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
