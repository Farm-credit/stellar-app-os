/**
 * Impact Dashboard Utilities
 * Helper functions for calculations and formatting
 */

import { CO2DataPoint, ImpactComparison } from "@/types/impact.types";

/**
 * Check if user prefers reduced motion (accessibility)
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Format large numbers with K/M suffix
 * @example formatNumber(1500) => "1.5K"
 * @example formatNumber(2500000) => "2.5M"
 */
export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

/**
 * Format date for chart display
 * @example formatChartDate("2024-01-15") => "Jan 2024"
 */
export function formatChartDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/**
 * Calculate real-world impact comparisons from CO2 offset
 * Uses EPA and scientific conversion factors
 */
export function calculateImpactComparisons(
  totalCO2Kg: number,
): ImpactComparison[] {
  // EPA Conversion Factors
  const CAR_ANNUAL_EMISSIONS = 4600; // kg CO2/year
  const MILES_PER_KG_CO2 = 2.5; // miles
  const CHARGES_PER_KG_CO2 = 121; // smartphone charges
  const BOTTLES_PER_KG_CO2 = 12.5; // plastic bottles

  return [
    {
      id: "cars",
      label: "Cars Off Road",
      value: Math.round(totalCO2Kg / CAR_ANNUAL_EMISSIONS),
      unit: "cars/year",
      icon: "Car",
      description:
        "Equivalent annual emissions from cars removed from the road",
    },
    {
      id: "miles",
      label: "Miles Not Driven",
      value: Math.round(totalCO2Kg * MILES_PER_KG_CO2),
      unit: "miles",
      icon: "Navigation",
      description: "Equivalent to avoiding this many miles of car travel",
    },
    {
      id: "charges",
      label: "Phone Charges",
      value: Math.round(totalCO2Kg * CHARGES_PER_KG_CO2),
      unit: "charges",
      icon: "Smartphone",
      description: "Equivalent smartphone charges saved from the grid",
    },
    {
      id: "bottles",
      label: "Plastic Bottles",
      value: Math.round(totalCO2Kg * BOTTLES_PER_KG_CO2),
      unit: "bottles",
      icon: "Droplet",
      description: "Equivalent plastic bottles not produced",
    },
  ];
}

/**
 * Generate mock CO2 timeline data for demonstration
 * In production, replace with API call
 */
export function generateMockCO2Timeline(months: number = 12): CO2DataPoint[] {
  const data: CO2DataPoint[] = [];
  const now = new Date();
  let cumulative = 0;

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    // Simulate progressive growth with variance
    const offset = Math.round(100 + Math.random() * 200 + (months - i) * 50);
    cumulative += offset;

    data.push({
      date: date.toISOString().split("T")[0],
      co2Offset: offset,
      cumulative,
    });
  }

  return data;
}

/**
 * Generate share text for social media
 */
export function generateShareText(
  totalCO2: number,
  totalTrees: number,
): string {
  const co2Tons = (totalCO2 / 1000).toFixed(1);
  return `I've offset ${co2Tons} tons of CO2 and planted ${totalTrees.toLocaleString()} trees! 🌱 Join me in making a positive environmental impact.`;
}

/**
 * Easing function for smooth animations
 * easeOutExpo: Fast start, slow end
 */
export function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}
