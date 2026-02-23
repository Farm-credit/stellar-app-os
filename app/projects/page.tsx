"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Text } from "@/components/atoms/Text";
import { ProjectGrid } from "@/components/organisms/ProjectGrid/ProjectGrid";
import { mockCarbonProjects } from "@/lib/api/mock/carbonProjects";

function ProjectsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");

  // Initialize view from URL or localStorage
  useEffect(() => {
    const urlView = searchParams.get("view");
    const storedView = localStorage.getItem("projectView");
    
    if (urlView === "grid" || urlView === "list") {
      setView(urlView);
      localStorage.setItem("projectView", urlView);
    } else if (storedView === "grid" || storedView === "list") {
      setView(storedView);
      // Sync to URL
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", storedView);
      router.replace(`/projects?${params.toString()}`, { scroll: false });
    }
    
    setIsLoading(false);
  }, [searchParams, router]);

  const handleViewChange = (newView: "grid" | "list") => {
    setView(newView);
    localStorage.setItem("projectView", newView);
    
    // Update URL
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", newView);
    router.replace(`/projects?${params.toString()}`, { scroll: false });
  };

  return (
    <ProjectGrid
      projects={mockCarbonProjects}
      view={view}
      onViewChange={handleViewChange}
      isLoading={isLoading}
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
