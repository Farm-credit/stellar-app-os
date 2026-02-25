export type DietType = 'vegan' | 'vegetarian' | 'average' | 'heavy-meat';

export type TransportMode = 'car' | 'public' | 'bike' | 'walk';

export interface TravelInput {
  shortFlightsPerYear: number;
  longFlightsPerYear: number;
  carMilesPerWeek: number;
  primaryTransport: TransportMode;
}

export interface EnergyInput {
  electricityKwhPerMonth: number;
  gasThermPerMonth: number;
  renewablePercentage: number;
}

export interface LifestyleInput {
  dietType: DietType;
  shoppingHabits: 'minimal' | 'average' | 'frequent';
}

export interface ImpactCalculatorInputs {
  travel: TravelInput;
  energy: EnergyInput;
  lifestyle: LifestyleInput;
}

export interface ImpactResults {
  travelEmissions: number;
  energyEmissions: number;
  lifestyleEmissions: number;
  totalEmissions: number;
  recommendedCredits: number;
  treesEquivalent: number;
}

// Standard emission factors (tonnes CO2 per year)
export const EMISSION_FACTORS = {
  shortFlight: 0.255, // tonnes CO2 per short-haul round trip
  longFlight: 1.65, // tonnes CO2 per long-haul round trip
  carMileWeekly: 0.0045, // tonnes CO2 per mile/week annualized
  publicTransportOffset: -0.3, // reduction for using public transit
  electricityKwh: 0.000417, // tonnes CO2 per kWh (US average)
  gasTherms: 0.0053, // tonnes CO2 per therm
  dietVegan: 1.5,
  dietVegetarian: 1.7,
  dietAverage: 2.5,
  dietHeavyMeat: 3.3,
  shoppingMinimal: 0.3,
  shoppingAverage: 0.8,
  shoppingFrequent: 1.5,
  creditsPerTonneCO2: 1, // 1 carbon credit = 1 tonne CO2
  treesPerTonneCO2: 45, // ~45 trees absorb 1 tonne CO2/year
} as const;

export type CalculatorStep = 'travel' | 'energy' | 'lifestyle' | 'results';

export const DEFAULT_TRAVEL: TravelInput = {
  shortFlightsPerYear: 2,
  longFlightsPerYear: 1,
  carMilesPerWeek: 100,
  primaryTransport: 'car',
};

export const DEFAULT_ENERGY: EnergyInput = {
  electricityKwhPerMonth: 900,
  gasThermPerMonth: 50,
  renewablePercentage: 0,
};

export const DEFAULT_LIFESTYLE: LifestyleInput = {
  dietType: 'average',
  shoppingHabits: 'average',
};
