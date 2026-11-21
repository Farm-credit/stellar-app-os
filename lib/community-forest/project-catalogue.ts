/**
 * Platform project catalogue used by community forests (Issue #1646).
 *
 * A community forest never introduces a second project concept: it always
 * grows from an existing project in the platform catalogue, so the base
 * project keeps its own type, location and verification status. The lookup
 * accepts either the project id (`proj-001`) or the admin slug
 * (`amazon-rainforest-reforestation`), like the existing project routes do.
 */

import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';

/** The parts of an existing project a community forest inherits. */
export interface CommunityForestBaseProject {
  id: string;
  name: string;
  description: string;
  type: string;
  location: string;
  country: string | null;
  verificationStatus: string | null;
}

/** Every project a community forest can be built on. */
export function listBaseProjects(): CommunityForestBaseProject[] {
  const adminProjects = mockAdminProjectDetails.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    type: project.type as string,
    location: project.location,
    country: project.country ?? null,
    verificationStatus: project.registry ?? null,
  }));

  const carbonProjects = mockCarbonProjects.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    type: project.type as string,
    location: project.location,
    country: null,
    verificationStatus: project.verificationStatus ?? null,
  }));

  const byId = new Map<string, CommunityForestBaseProject>();
  for (const project of [...adminProjects, ...carbonProjects]) {
    if (!byId.has(project.id)) byId.set(project.id, project);
  }

  return [...byId.values()];
}

/** Finds a base project by id or admin slug. */
export function findBaseProject(idOrSlug: string): CommunityForestBaseProject | null {
  const needle = idOrSlug.trim().toLowerCase();
  if (!needle) return null;

  const adminProject = mockAdminProjectDetails.find(
    (project) =>
      project.id.toLowerCase() === needle || project.slug.toLowerCase() === needle
  );

  if (adminProject) {
    return {
      id: adminProject.id,
      name: adminProject.name,
      description: adminProject.description,
      type: adminProject.type as string,
      location: adminProject.location,
      country: adminProject.country ?? null,
      verificationStatus: adminProject.registry ?? null,
    };
  }

  const carbonProject = mockCarbonProjects.find(
    (project) => project.id.toLowerCase() === needle
  );

  if (carbonProject) {
    return {
      id: carbonProject.id,
      name: carbonProject.name,
      description: carbonProject.description,
      type: carbonProject.type as string,
      location: carbonProject.location,
      country: null,
      verificationStatus: carbonProject.verificationStatus ?? null,
    };
  }

  return null;
}
