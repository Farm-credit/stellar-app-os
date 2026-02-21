/**
 * Impact Service
 *
 * Handles fetching and transforming impact statistics.
 * Currently uses mock data — replace API calls with real endpoints in production.
 */

import {
  ImpactStats,
  ProjectLocation,
  CO2DataPoint,
} from "@/types/impact.types";
import {
  calculateImpactComparisons,
  generateMockCO2Timeline,
} from "@/lib/Impact-utils";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_PROJECTS: ProjectLocation[] = [
  {
    id: "proj-001",
    name: "Amazon Reforestation Initiative",
    lat: -3.4653,
    lng: -62.2159,
    treesPlanted: 12500,
    type: "reforestation",
    description:
      "Large-scale reforestation effort in the Brazilian Amazon, restoring biodiversity and carbon sequestration across degraded land.",
  },
  {
    id: "proj-002",
    name: "Borneo Conservation Zone",
    lat: 1.5533,
    lng: 110.3592,
    treesPlanted: 8200,
    type: "conservation",
    description:
      "Protecting critical rainforest habitat in Borneo, safeguarding orangutans and thousands of endemic species from deforestation.",
  },
  {
    id: "proj-003",
    name: "Sahel Green Wall",
    lat: 13.5137,
    lng: 2.1098,
    treesPlanted: 21000,
    type: "reforestation",
    description:
      "Part of Africa's Great Green Wall project, planting drought-resistant trees across the Sahel to combat desertification.",
  },
  {
    id: "proj-004",
    name: "North Sea Wind Farm",
    lat: 56.5,
    lng: 3.5,
    treesPlanted: 0,
    type: "renewable-energy",
    description:
      "Offshore wind energy project supplying clean electricity to over 300,000 homes while dramatically reducing CO2 emissions.",
  },
  {
    id: "proj-005",
    name: "Pacific Ocean Cleanup",
    lat: 28.0,
    lng: -145.0,
    treesPlanted: 0,
    type: "ocean-cleanup",
    description:
      "Deploying advanced systems to remove plastic waste from the Great Pacific Garbage Patch, protecting marine ecosystems.",
  },
  {
    id: "proj-006",
    name: "Himalayan Watershed Restoration",
    lat: 27.9881,
    lng: 86.925,
    treesPlanted: 5400,
    type: "reforestation",
    description:
      "Restoring native forest cover in critical Himalayan watersheds to protect water sources for millions of people downstream.",
  },
];

// ---------------------------------------------------------------------------
// Service Functions
// ---------------------------------------------------------------------------

/**
 * Fetch full impact statistics for the current user.
 * Simulates a network delay to mimic a real API call.
 */
export async function fetchImpactStats(): Promise<ImpactStats> {
  // Simulate network latency
  await delay(800);

  const co2Timeline: CO2DataPoint[] = generateMockCO2Timeline(12);
  const totalCO2 = co2Timeline[co2Timeline.length - 1].cumulative;
  const totalTrees = MOCK_PROJECTS.reduce((sum, p) => sum + p.treesPlanted, 0);
  const activeProjects = MOCK_PROJECTS.length;
  const comparisons = calculateImpactComparisons(totalCO2);

  return {
    co2Timeline,
    totalCO2,
    totalTrees,
    projects: MOCK_PROJECTS,
    comparisons,
    activeProjects,
  };
}

/**
 * Fetch project locations only (lightweight call for map-only views).
 */
export async function fetchProjects(): Promise<ProjectLocation[]> {
  await delay(400);
  return MOCK_PROJECTS;
}

/**
 * Fetch CO2 timeline only (for chart-only views or refreshing chart data).
 */
export async function fetchCO2Timeline(
  months: number = 12,
): Promise<CO2DataPoint[]> {
  await delay(300);
  return generateMockCO2Timeline(months);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
