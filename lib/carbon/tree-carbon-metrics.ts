/**
 * Tree carbon sequestration calculation — Issue #1621.
 *
 * Pure computation module: no server-only dependencies (no sharp, no child_process).
 * Safe to import from client components and from lib/carbon-offset-certificate.ts.
 *
 * Uses the project's actual IPCC Tier 1 methodology and allometric parameters
 * from lib/carbon/ipcc-tier1.ts. Flags missing parameters rather than inventing
 * values, as required by the acceptance criteria.
 */

import { TREE_SPECIES, type ClimateZone } from '@/lib/constants/species';
import {
  cumulativeCo2Kg,
  estimateTreeSequestration,
  inferClimateZone,
  SPECIES_ALLOMETRY,
  type TreeSequestration,
} from '@/lib/carbon/ipcc-tier1';
import type { Tree } from '@/lib/types/tree';

export interface TreeCarbonMetrics {
  annualRateKg: number;
  annualRateUnit: string;
  storedToDateKg: number;
  storedToDateUnit: string;
  currentAgeYears: number;
  at10YearsKg: number;
  at25YearsKg: number;
  atMaturityKg: number;
  atMaturityTonnes: number;
  maturityYears: number;
  methodology: string;
  hasMissingFormula: boolean;
  missingFormulaReason?: string;
}

/**
 * Calculates carbon sequestration over time using the project's actual
 * IPCC Tier 1 methodology and tree parameters.
 * If species parameters or formulas are missing, flags it instead of inventing values.
 */
export function calculateTreeCarbonMetrics(
  tree: Pick<Tree, 'species' | 'lat' | 'plantedAt' | 'co2OffsetKgPerYear' | 'climateZone'>
): TreeCarbonMetrics {
  const speciesInfo = TREE_SPECIES.find((s) => s.name === tree.species);
  const climateZone: ClimateZone =
    tree.climateZone ?? inferClimateZone(tree.species, tree.lat ?? 0);

  // Check if species is in allometry lookup
  const hasAllometry = speciesInfo ? Boolean(SPECIES_ALLOMETRY[speciesInfo.slug]) : false;

  if (!speciesInfo || !hasAllometry) {
    return {
      annualRateKg: tree.co2OffsetKgPerYear || 0,
      annualRateUnit: 'kg CO₂ / year',
      storedToDateKg: 0,
      storedToDateUnit: 'kg CO₂',
      currentAgeYears: 0,
      at10YearsKg: 0,
      at25YearsKg: 0,
      atMaturityKg: 0,
      atMaturityTonnes: 0,
      maturityYears: 25,
      methodology: 'Standard baseline',
      hasMissingFormula: true,
      missingFormulaReason: `Allometric parameters not defined for species "${tree.species}"`,
    };
  }

  try {
    const sequestration: TreeSequestration = estimateTreeSequestration({
      species: tree.species,
      climateZone,
      plantedAt: tree.plantedAt,
    });

    const maturityYears = speciesInfo.maturityYears || 25;
    const at10YearsKg = cumulativeCo2Kg(tree.species, climateZone, 10);
    const at25YearsKg = cumulativeCo2Kg(tree.species, climateZone, 25);
    const atMaturityKg = cumulativeCo2Kg(tree.species, climateZone, maturityYears);

    return {
      annualRateKg: Number(sequestration.annualCo2Kg.toFixed(1)),
      annualRateUnit: 'kg CO₂ / year',
      storedToDateKg: Number(sequestration.cumulativeCo2Kg.toFixed(1)),
      storedToDateUnit: 'kg CO₂',
      currentAgeYears: Number(sequestration.inputs.ageYears.toFixed(1)),
      at10YearsKg: Number(at10YearsKg.toFixed(1)),
      at25YearsKg: Number(at25YearsKg.toFixed(1)),
      atMaturityKg: Number(atMaturityKg.toFixed(1)),
      atMaturityTonnes: Number((atMaturityKg / 1000).toFixed(3)),
      maturityYears,
      methodology: 'IPCC Tier 1 / Chave et al. (2014)',
      hasMissingFormula: false,
    };
  } catch (error) {
    return {
      annualRateKg: tree.co2OffsetKgPerYear || 0,
      annualRateUnit: 'kg CO₂ / year',
      storedToDateKg: 0,
      storedToDateUnit: 'kg CO₂',
      currentAgeYears: 0,
      at10YearsKg: 0,
      at25YearsKg: 0,
      atMaturityKg: 0,
      atMaturityTonnes: 0,
      maturityYears: speciesInfo.maturityYears || 25,
      methodology: 'Fallback',
      hasMissingFormula: true,
      missingFormulaReason: error instanceof Error ? error.message : 'Calculation error',
    };
  }
}
