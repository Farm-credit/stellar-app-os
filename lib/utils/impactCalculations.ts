import {
  type TravelInput,
  type EnergyInput,
  type LifestyleInput,
  type ImpactResults,
  EMISSION_FACTORS,
} from '@/lib/types/impact-calculator';

export function calculateTravelEmissions(travel: TravelInput): number {
  const flights =
    travel.shortFlightsPerYear * EMISSION_FACTORS.shortFlight +
    travel.longFlightsPerYear * EMISSION_FACTORS.longFlight;

  let driving = travel.carMilesPerWeek * 52 * EMISSION_FACTORS.carMileWeekly;

  if (travel.primaryTransport === 'public') {
    driving += EMISSION_FACTORS.publicTransportOffset;
  } else if (travel.primaryTransport === 'bike' || travel.primaryTransport === 'walk') {
    driving *= 0.1; // minimal car use
  }

  return Math.max(0, flights + driving);
}

export function calculateEnergyEmissions(energy: EnergyInput): number {
  const electricity = energy.electricityKwhPerMonth * 12 * EMISSION_FACTORS.electricityKwh;
  const gas = energy.gasThermPerMonth * 12 * EMISSION_FACTORS.gasTherms;
  const renewableReduction = 1 - energy.renewablePercentage / 100;

  return Math.max(0, (electricity + gas) * renewableReduction);
}

export function calculateLifestyleEmissions(lifestyle: LifestyleInput): number {
  const dietMap: Record<string, number> = {
    vegan: EMISSION_FACTORS.dietVegan,
    vegetarian: EMISSION_FACTORS.dietVegetarian,
    average: EMISSION_FACTORS.dietAverage,
    'heavy-meat': EMISSION_FACTORS.dietHeavyMeat,
  };

  const shoppingMap: Record<string, number> = {
    minimal: EMISSION_FACTORS.shoppingMinimal,
    average: EMISSION_FACTORS.shoppingAverage,
    frequent: EMISSION_FACTORS.shoppingFrequent,
  };

  return (dietMap[lifestyle.dietType] ?? 0) + (shoppingMap[lifestyle.shoppingHabits] ?? 0);
}

export function calculateImpact(
  travel: TravelInput,
  energy: EnergyInput,
  lifestyle: LifestyleInput
): ImpactResults {
  const travelEmissions = calculateTravelEmissions(travel);
  const energyEmissions = calculateEnergyEmissions(energy);
  const lifestyleEmissions = calculateLifestyleEmissions(lifestyle);
  const totalEmissions = travelEmissions + energyEmissions + lifestyleEmissions;

  return {
    travelEmissions: parseFloat(travelEmissions.toFixed(2)),
    energyEmissions: parseFloat(energyEmissions.toFixed(2)),
    lifestyleEmissions: parseFloat(lifestyleEmissions.toFixed(2)),
    totalEmissions: parseFloat(totalEmissions.toFixed(2)),
    recommendedCredits: Math.ceil(totalEmissions * EMISSION_FACTORS.creditsPerTonneCO2),
    treesEquivalent: Math.round(totalEmissions * EMISSION_FACTORS.treesPerTonneCO2),
  };
}
