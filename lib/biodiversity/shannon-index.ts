/**
 * Shannon Diversity Index Calculator
 *
 * Calculates the Shannon Diversity Index (H') for forest biodiversity assessment.
 * H' = -Σ(pi * ln(pi))
 * where pi is the proportion of individuals of species i relative to total individuals
 *
 * Higher values indicate greater diversity (typically 1.5-3.5 for forests)
 */

export interface SpeciesCount {
  speciesId: string;
  speciesName: string;
  count: number;
}

export interface BiodiversityIndexResult {
  shannonIndex: number;
  speciesRichness: number; // Number of species
  totalIndividuals: number;
  evenness: number; // H' / ln(speciesRichness)
  interpretation: string;
}

/**
 * Calculate Shannon Diversity Index from species count data
 */
export function calculateShannonIndex(speciesData: SpeciesCount[]): BiodiversityIndexResult {
  if (speciesData.length === 0) {
    return {
      shannonIndex: 0,
      speciesRichness: 0,
      totalIndividuals: 0,
      evenness: 0,
      interpretation: 'No species data available',
    };
  }

  const totalIndividuals = speciesData.reduce((sum, s) => sum + s.count, 0);

  if (totalIndividuals === 0) {
    return {
      shannonIndex: 0,
      speciesRichness: speciesData.length,
      totalIndividuals: 0,
      evenness: 0,
      interpretation: 'No individuals recorded',
    };
  }

  const speciesRichness = speciesData.length;

  // Calculate Shannon Index: H' = -Σ(pi * ln(pi))
  let shannonIndex = 0;
  for (const species of speciesData) {
    if (species.count > 0) {
      const proportion = species.count / totalIndividuals;
      shannonIndex -= proportion * Math.log(proportion);
    }
  }

  // Calculate Evenness: J = H' / ln(S)
  const maxPossibleIndex = Math.log(speciesRichness);
  const evenness = maxPossibleIndex > 0 ? shannonIndex / maxPossibleIndex : 0;

  return {
    shannonIndex,
    speciesRichness,
    totalIndividuals,
    evenness,
    interpretation: interpretShannonIndex(shannonIndex, evenness),
  };
}

/**
 * Provide plain-language interpretation of Shannon Index
 */
function interpretShannonIndex(index: number, evenness: number): string {
  if (index < 1.0) {
    return 'Low diversity - dominated by few species';
  } else if (index < 2.0) {
    return 'Moderate diversity - mixed species composition';
  } else if (index < 3.0) {
    return 'High diversity - well-balanced ecosystem';
  } else {
    return 'Very high diversity - rich, balanced ecosystem';
  }
}

/**
 * Compare current biodiversity to baseline
 */
export interface BiodiversityComparison {
  current: BiodiversityIndexResult;
  baseline: BiodiversityIndexResult;
  change: number; // Percentage change
  trend: 'improving' | 'declining' | 'stable';
  summary: string;
}

export function compareBiodiversity(
  current: BiodiversityIndexResult,
  baseline: BiodiversityIndexResult
): BiodiversityComparison {
  const change =
    baseline.shannonIndex > 0
      ? ((current.shannonIndex - baseline.shannonIndex) / baseline.shannonIndex) * 100
      : 0;

  let trend: 'improving' | 'declining' | 'stable';
  if (Math.abs(change) < 5) {
    trend = 'stable';
  } else if (change > 0) {
    trend = 'improving';
  } else {
    trend = 'declining';
  }

  const summary = generateComparisonSummary(
    trend,
    change,
    current.speciesRichness,
    baseline.speciesRichness
  );

  return {
    current,
    baseline,
    change,
    trend,
    summary,
  };
}

function generateComparisonSummary(
  trend: 'improving' | 'declining' | 'stable',
  change: number,
  currentSpecies: number,
  baselineSpecies: number
): string {
  const speciesChange = currentSpecies - baselineSpecies;

  if (trend === 'improving') {
    return `Biodiversity has improved by ${change.toFixed(1)}% since project start. ${speciesChange > 0 ? `Species richness increased from ${baselineSpecies} to ${currentSpecies}.` : 'Species count maintained.'}`;
  } else if (trend === 'declining') {
    return `Biodiversity has declined by ${Math.abs(change).toFixed(1)}% since project start. ${speciesChange < 0 ? `Species richness decreased from ${baselineSpecies} to ${currentSpecies}.` : 'Species count maintained.'}`;
  } else {
    return `Biodiversity remains stable since project start. Species count at ${currentSpecies}.`;
  }
}

/**
 * Calculate biodiversity trend over time from annual census data
 */
export interface AnnualCensusData {
  year: number;
  speciesData: SpeciesCount[];
  date: string;
}

export interface BiodiversityTrend {
  years: number[];
  indices: number[];
  trend: 'increasing' | 'decreasing' | 'stable';
  averageChange: number;
}

export function calculateBiodiversityTrend(censusData: AnnualCensusData[]): BiodiversityTrend {
  if (censusData.length < 2) {
    return {
      years: censusData.map((d) => d.year),
      indices: censusData.map((d) => calculateShannonIndex(d.speciesData).shannonIndex),
      trend: 'stable',
      averageChange: 0,
    };
  }

  const sortedData = [...censusData].sort((a, b) => a.year - b.year);
  const indices = sortedData.map((d) => calculateShannonIndex(d.speciesData).shannonIndex);
  const years = sortedData.map((d) => d.year);

  // Calculate average annual change
  const changes: number[] = [];
  for (let i = 1; i < indices.length; i++) {
    if (indices[i - 1] > 0) {
      changes.push(((indices[i] - indices[i - 1]) / indices[i - 1]) * 100);
    }
  }

  const averageChange =
    changes.length > 0 ? changes.reduce((sum, c) => sum + c, 0) / changes.length : 0;

  let trend: 'increasing' | 'decreasing' | 'stable';
  if (Math.abs(averageChange) < 2) {
    trend = 'stable';
  } else if (averageChange > 0) {
    trend = 'increasing';
  } else {
    trend = 'decreasing';
  }

  return {
    years,
    indices,
    trend,
    averageChange,
  };
}
