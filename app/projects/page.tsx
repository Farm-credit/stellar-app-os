'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Text } from '@/components/atoms/Text';
import { ProjectGrid } from '@/components/organisms/ProjectGrid/ProjectGrid';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';

function ProjectsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isInitialMount = useRef(true);

  // Initialize view from URL or localStorage
  const getInitialView = (): 'grid' | 'list' => {
    const urlView = searchParams.get('view');
    if (urlView === 'grid' || urlView === 'list') {
      return urlView;
    }
    const storedView = localStorage.getItem('projectView');
    if (storedView === 'grid' || storedView === 'list') {
      return storedView;
    }
    return 'grid';
  };

  const [view, setView] = useState<'grid' | 'list'>(getInitialView);

  // Sync URL with view state on initial mount
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const urlView = searchParams.get('view');
      if (urlView !== view) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('view', view);
        router.replace(`/projects?${params.toString()}`, { scroll: false });
      }
    }
  }, [view, searchParams, router]);

  const handleViewChange = (newView: 'grid' | 'list') => {
    setView(newView);
    localStorage.setItem('projectView', newView);

    // Update URL
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', newView);
    router.replace(`/projects?${params.toString()}`, { scroll: false });
  };

  return (
    <ProjectGrid
      projects={mockCarbonProjects}
      view={view}
      onViewChange={handleViewChange}
      isLoading={false}
    />
  );
}

export default function ProjectsPage() {
  return (
    <main className="container mx-auto px-4 py-8 sm:py-10">
      <div className="mb-8">
        <Text as="h1" variant="h2" className="mb-2">
          Carbon Credit Projects
        </Text>
        <Text as="p" variant="muted">
          Browse and support verified carbon offset projects around the world
        </Text>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <ProjectsContent />
      </Suspense>
    </main>
  );
}
