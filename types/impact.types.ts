/**
 * Impact Dashboard Type Definitions
 * Strict TypeScript types for all impact-related data structures
 */

/**
 * Single data point in CO2 offset timeline
 */
export interface CO2DataPoint {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** CO2 offset for this period in kg */
  co2Offset: number;
  /** Cumulative CO2 offset in kg */
  cumulative: number;
}

/**
 * Project location on the map
 */
export interface ProjectLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  treesPlanted: number;
  type: "reforestation" | "renewable-energy" | "ocean-cleanup" | "conservation";
  description: string;
}

/**
 * Real-world impact comparison
 */
export interface ImpactComparison {
  id: string;
  label: string;
  value: number;
  unit: string;
  icon: "Car" | "Navigation" | "Smartphone" | "Droplet";
  description: string;
}

/**
 * Complete impact statistics
 */
export interface ImpactStats {
  co2Timeline: CO2DataPoint[];
  totalCO2: number;
  totalTrees: number;
  projects: ProjectLocation[];
  comparisons: ImpactComparison[];
  activeProjects: number;
}

/**
 * Social share platforms
 */
export type SharePlatform = "twitter" | "facebook" | "linkedin" | "copy";
