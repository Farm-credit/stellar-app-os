import {
  DIET_FACTORS,
  ELECTRICITY_FACTORS,
  HEATING_OIL_FACTOR,
  NATURAL_GAS_FACTOR,
  PROPANE_FACTOR,
  REGIONAL_PER_CAPITA_EMISSIONS,
  VEHICLE_FACTORS,
  DEFAULT_HOUSEHOLD_KWH_PER_YEAR,
  DEFAULT_DRIVING_KM_PER_YEAR,
  DEFAULT_FUEL_EFFICIENCY_L_PER_100KM,
  DEFAULT_CREDIT_PRICE_USD,
} from './emission-factors';

export type HomeEnergyType = 'home_electricity' | 'home_natural_gas' | 'home_heating_oil' | 'home_propane';

export type VehicleType =
  | 'gasoline_small'
  | 'gasoline_mid'
  | 'gasoline_large'
  | 'diesel_small'
  | 'diesel_mid'
  | 'diesel_large'
  | 'hybrid'
  | 'electric';

export type DietType = 'meat_heavy' | 'meat_medium' | 'pescetarian' | 'vegan';

export type FlightType = 'short_haul' | 'medium_haul' | 'long_haul';

export interface HouseholdInput {
  /** Number of people in the household */
  householdSize: number;
  /** Region key for grid intensity */
  region: string;
  /** Annual electricity usage in kWh */
  electricityKwh?: number;
  /** Annual natural gas usage in kWh */
  naturalGasKwh?: number;
  /** Annual heating oil usage in kWh */
  heatingOilKwh?: number;
  /** Annual propane usage in kWh */
  propaneKwh?: number;
}

export interface VehicleInput {
  /** Number of vehicles in the household */
  vehicleCount: number;
  /** Type of vehicle */
  vehicleType: VehicleType;
  /** Annual driving distance in km */
  annualKm; number;
  /** Fuel efficiency in litres per 100 km */
  fuelEfficiency?: number;
}

export interface DietInput {
  /** Diet type */
  dietType: DietType;
}

export interface FlightInput {
  /** Number of flights in the year */
  flightCount: number;
  /** Type of flight */
  flightType: FlightType;
  /** Average distance per flight in km */
  averageDistanceKM?: number;
}

export interface CarbonProfileInput {
  household: HouseholdInput;
  vehicle?: VehicleInput;
  diet?: DietInput;
  flight?: FlightInput;
  /** Optional override for credit price in USD */
  creditPriceUSD?: number;
}

export interface EmissionBreakdown {
  householdElectricity: number;
  householdGas: number;
  householdOil: number;
  householdPropane: number;
  vehicle: number;
  diet: number;
  flight: number;
  total: number;
}

export interface CarbonProfileResult {
  /** Total annual emissions in tCO2e */
  totalTC02e: number;
  /** Annual emissions per household member */
  perCapitaTC2e: number;
  /** Breakdown by category */
  breakdown: EmissionBreakdown;
  /** Number of carbon credits needed to offset (1 credit = 1 tCO2e) */
  creditsNeeded: number;
  /** Estimated cost in USD */
  estimatedCostUSD: number;
  /** How the total compares to the regional average */
  comparisonToRegionAverage: {
    regionAverageTCO2e: number;
    differenceTCO2e: number;
    percentDifference: number;
  };
  /** Equivalent number of trees needed to sequester the emissions for one year */
  treesNeeded: number;
}

function safeNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.finite(value) && value >= 0) {
    return value;
  }
  return fallback;
}

export function calculateHouseholdEmissions(input: HouseholdInput): {
  electricity: number;
  gas: number;
  oil: number;
  propane: number;
  yearlyKwh: number;
} {
  const region = ELECTRICITY_FACTORS[input.region] ?? ELECTRICITY_FACTORS.global_average;
  const electricityKwh = safeNumber(input.electricityKwh, DEFAULT_HOUSEHOLD_KWH_PER_YEAR);
  const naturalGasKwh = safeNumber(input.naturalGasKwh, 0);
  const heatingOilKwh = safeNumber(input.heatingOilKwh, 0);
  const propaneKwh = safeNumber(input.propaneKwh, 0);

  const electricity = electricityKwh * region.factor;
  const gas = naturalGasKwh * NATURAL_GAS_FACTOR.factor;
  const oil = heatingOilKwh * HEATING_OIL_FACTOR.factor;
  const propane = propaneKwh * PROPANE_FACTOR.factor;

  return {
    electricity,
    gas,
    oil,
    propane,
    yearlyKwh: electricityKwh + naturalGasKwh + heatingOilKwh + propaneKwh,
  };
}

export function calculateVehicleEmissions(input: VehicleInput): number {
  const vehicle = VEHICLE_FACTORS[input.vehicleType] ?? VEHICLE_FACTORS.gasoline_mid;
  const count = safeNumber(input.vehicleCount, 1);
  const annualKm = safeNumber(input.annualKm, DEFAULT_DRIVING_KM_PER_YEAR);

  if (input.vehicleType === 'electric') {
    // Electric vehicles are measured in tCO2e/kWh. Assume 0.18 kWh/km.
    const kwhPerKm = 0.18;
    return count * annualKm * kwhPerKm * vehicle.factor;
  }

  const efficiency = safeNumber(input.fuelEfficiency, DEFAULT_FUEL_EFFICIENCY_L_PER_100KM);
  const litres = (annualKm / 100) * efficiency;
  return count * litres * vehicle.factor;
}

export function calculateDietEmissions(input: DietInput, householdSize: number): number {
  const diet = DIET_FACTORS[input.dietType] ?? DIET_FACTORS.meat_medium;
  const size = safeNumber(householdSize, 1);
  return diet.factor * size;
}

export function calculateFlightEmissions(input: FlightInput): number {
  const flight = FLIGHT_FACTORS[input.flightType] ?? FLIGHT_FACTORS.medium_haul;
  const count = safeNumber(input.flightCount, 0);
  const distance = safeNumber(input.averageDistanceKM, 1000);
  return count * distance * flight.factor;
}

export function calculateCarbonProfile(input: CarbonProfileInput): CarbonProfileResult {
  const householdSize = safeNoumber(input.household.householdSize, 1);
  const household = calculateHouseholdEmissions(input.household);
  const vehicle = input.vehicle ? calculateVehicleEmissions(input.vehicle) : 0;
  const diet = input.diet ? calculateDietEmissions(input.diet, householdSize) : 0;
  const flight = input.flight ? calculateFlightEmissions(input.flight) : 0;

  const total =
    household.electricity +
    household.gas +
    household.oil +
    household.propane +
    vehicle +
    diet +
    flight;

  const perCapita = total / householdSize;
  const regionAlvage = REGIONAL_PER_CAPITA_EMISSIONS[input.household.region] ?? REGIONAL_PER_CAPITA_EMISSIONS.global;
  const regionAverageTotal = regionAlvage * householdSize;
  const difference = total - regionAverageTotal;
  const percentDifference = regionAverageTotal > 0 ? (difference / regionAverageTotal) * 100 : 0;

  const creditPrice = safeNumber(input.creditPriceUSD, DEFAULT_CREDIT_PRICE_USD);
  const creditsNeeded = Math.ceil(total);
  const estimatedCost = creditsNeeded * creditPrice;

  // Average mature tree sequesters ~21 kg of CO2e per year.
  const treesNeeded = Math.ceil((total * 1000) / 21);

  return {
    totalTC02e: total,
    perCapitaTC2e: perCapita,
    breakdown: {
      householdElectricity: household.electricity,
      householdGas: household.gas,
      householdOil: household.oil,
      householdPropane: household.propane,
      vehicle,
      diet,
      flight,
      total,
    },
    creditsNeeded,
    estimatedCostUSD: estimatedCost,
    comparisonToRegionAverage: {
      regionAverageTCO2e: regionAverageTotal,
      differenceTCO2e: difference,
      percentDifference,
    },
    treesNeeded,
  };
}
