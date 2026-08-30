import { mockPlanterProfiles } from '@/lib/api/mock/planterProfiles';
import type { PlanterProfile } from '@/lib/types/planter';

/** Simulated network latency to mimic an API round-trip. */
function delay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
} /** Return all planter profiles (optionally filtered by featured). */
export function getMockPlanters(
  options: { featuredOnly?: boolean } = {}
): Promise<PlanterProfile[]> {
  const all = options.featuredOnly
    ? mockPlanterProfiles.filter((p) => p.isFeatured)
    : mockPlanterProfiles;
  return delay(all);
}

/** Return a single planter profile by id or slug. */
export function getMockPlanterById(idOrSlug: string): Promise<PlanterProfile | null> {
  const planter = mockPlanterProfiles.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
  return delay(planter ?? null);
}

/** Return planters involved with a given project (by project id). */
export function getMockPlantersByProject(projectId: string): Promise<PlanterProfile[]> {
  const planters = mockPlanterProfiles.filter((p) => p.projectIds.includes(projectId));
  return delay(planters);
}

/** Synchronous helpers for server components / static rendering. */
export function getAllPlanters(): PlanterProfile[] {
  return mockPlanterProfiles;
}

export function getPlanterById(idOrSlug: string): PlanterProfile | null {
  return mockPlanterProfiles.find((p) => p.id === idOrSlug || p.slug === idOrSlug) ?? null;
}

export function getPlantersByProject(projectId: string): PlanterProfile[] {
  return mockPlanterProfiles.filter((p) => p.projectIds.includes(projectId));
}
