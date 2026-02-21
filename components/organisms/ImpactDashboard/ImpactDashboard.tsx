/**
 * ImpactDashboard Organism Component
 *
 * Main dashboard orchestrating all impact visualization components.
 * Handles data fetching, loading states, and component composition.
 */

"use client";

import { useEffect, useState } from "react";
import { TreePine, TrendingUp, MapPin } from "lucide-react";
import { ImpactStats } from "@/types/impact.types";
import { EmptyState } from "./EmptyState";
import { StatCard } from "./StatCard";
import { Counter } from "./Counter";
import { formatNumber } from "@/lib/Impact-utils";
import { CO2Chart } from "./CO2Chart";
import { ImpactComparisons } from "./ImpactComparisons";
import { ProjectMap } from "./ProjectMap";
import { SocialShare } from "./SocialShare";
import { fetchImpactStats } from "@/lib/Impact-service";

/**
 * Loading skeleton component
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="h-10 w-96 bg-muted/50 rounded-xl" />
        <div className="h-5 w-72 bg-muted/50 rounded-lg" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-44 bg-muted/30 rounded-2xl border border-border"
          />
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="h-96 bg-muted/30 rounded-2xl border border-border" />

      {/* Comparisons skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-52 bg-muted/30 rounded-2xl border border-border"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Main Impact Dashboard
 */
export function ImpactDashboard() {
  const [data, setData] = useState<ImpactStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch impact statistics
    fetchImpactStats()
      .then((stats) => {
        setData(stats);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Failed to fetch impact stats:", error);
        setIsLoading(false);
      });
  }, []);

  // Loading state
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Empty state (no data)
  if (!data || (data.totalCO2 === 0 && data.totalTrees === 0)) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-10">
      {/* Header Section */}
      <header className="space-y-3">
        <h1 className="text-4xl font-bold text-foreground tracking-tight">
          Your Environmental Impact
        </h1>
        <p className="text-lg text-muted-foreground">
          Track your positive contribution to the planet and see your real-world
          difference
        </p>
      </header>

      {/* Key Metrics - Three main statistics */}
      <section aria-label="Key impact metrics">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Total CO2 Offset */}
          <StatCard
            label="Total CO₂ Offset"
            icon={TrendingUp}
            iconColor="blue"
            description="Kilograms of CO₂ removed from atmosphere"
          >
            <Counter
              value={data.totalCO2}
              formatter={(v) => `${formatNumber(v)} kg`}
            />
          </StatCard>

          {/* Trees Planted */}
          <StatCard
            label="Trees Planted"
            icon={TreePine}
            iconColor="green"
            description="Contributing to global reforestation efforts"
          >
            <Counter value={data.totalTrees} />
          </StatCard>

          {/* Active Projects */}
          <StatCard
            label="Active Projects"
            icon={MapPin}
            iconColor="purple"
            description="Worldwide environmental initiatives supported"
          >
            <Counter value={data.activeProjects} />
          </StatCard>
        </div>
      </section>

      {/* CO2 Timeline Chart */}
      <section
        aria-labelledby="co2-chart-heading"
        className="bg-card border border-border rounded-2xl p-8 shadow-sm"
      >
        <header className="mb-8">
          <h2
            id="co2-chart-heading"
            className="text-2xl font-bold text-foreground mb-2"
          >
            CO₂ Offset Over Time
          </h2>
          <p className="text-sm text-muted-foreground">
            Your carbon reduction journey visualized month by month
          </p>
        </header>
        <CO2Chart data={data.co2Timeline} />
      </section>

      {/* Real-World Impact Comparisons */}
      <section aria-labelledby="comparisons-heading">
        <header className="mb-8">
          <h2
            id="comparisons-heading"
            className="text-2xl font-bold text-foreground mb-2"
          >
            Real-World Impact
          </h2>
          <p className="text-sm text-muted-foreground">
            Your environmental contribution in relatable, everyday terms
          </p>
        </header>
        <ImpactComparisons comparisons={data.comparisons} />
      </section>

      {/* Global Projects Map */}
      <section aria-labelledby="map-heading">
        <header className="mb-8">
          <h2
            id="map-heading"
            className="text-2xl font-bold text-foreground mb-2"
          >
            Global Projects
          </h2>
          <p className="text-sm text-muted-foreground">
            Explore the locations where your impact is making a tangible
            difference
          </p>
        </header>
        <ProjectMap projects={data.projects} />
      </section>

      {/* Social Sharing */}
      <section aria-labelledby="share-heading">
        <SocialShare totalCO2={data.totalCO2} totalTrees={data.totalTrees} />
      </section>

      {/* Footer timestamp */}
      <footer className="text-center pt-4">
        <p className="text-sm text-muted-foreground">
          Last updated:{" "}
          {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </footer>
    </div>
  );
}
