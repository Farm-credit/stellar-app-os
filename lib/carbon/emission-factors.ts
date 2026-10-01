/**
 * Emission factors for carbon offset calculations.
 *
 * Values are expressed in metric tons of CO2‑equivalent (tCO2e) per unit of activity unless otherwise noted.
 * Sources are indicative public averages (EPA, DEFU, IEA) and intended for estimation only.
 */

export interface EmissionFactor {
  /** Human-readable label */
  label: string;
  /** tCO2e per unit */
  factor: number;
  /** Unit description */
  unit: string;
  /** Optional source attribution */
  source?: string;
}

/** Electricity grid intensity (tCO2e per kWh). */
export const ELECTRICITY_FACTORS: Record<string, EmissionFactor> = {
  global_average: { label: 'Global average', factor: 0.475, unit: 'tCO2e/kWh', source: 'IEA 2023' },
  us_average: {
    label: 'United States',
    factor: 0.393,
    unit: 'tCO2e/kWh',
    source: 'EPA eGRID 2022',
  },
  eu_average: { label: 'European Union', factor: 0.251, unit: 'tCO2e/kWh', source: 'EEA 2022' },
  india: { label: 'India', factor: 0.713, unit: 'tCO2e/kWh', source: 'IEA 2023' },
  brazil: { label: 'Brazil', factor: 0.122, unit: 'tCO2e/kWh', source: 'IEA 2023' },
  kenya: { label: 'Kenya', factor: 0.1, unit: 'tCO2e/kWh', source: 'IEA 2023' },
};

/** Vehicle fuel emission factors (tCO2e per litre or per unit). */
export const VEHICLE_FACTORS: Record<string, EmissionFactor> = {
  gasoline_small: {
    label: 'Gasoline (compact)',
    factor: 0.192,
    unit: 'tCO2e/litre',
    source: 'DEFU 2023',
  },
  gasoline_mid: {
    label: 'Gasoline (midsize)',
    factor: 0.22,
    unit: 'tCO2e/litre',
    source: 'DEFU 2023',
  },
  gasoline_large: {
    label: 'Gasoline (SUV/Truck)',
    factor: 0.285,
    unit: 'tCO2e/litre',
    source: 'DEFU 2023',
  },
  diesel_small: {
    label: 'Diesel (compact)',
    factor: 0.17,
    unit: 'tCO2e/litre',
    source: 'DEFU 2023',
  },
  diesel_mid: {
    label: 'Diesel (midsize)',
    factor: 0.198,
    unit: 'tCO2e/litre',
    source: 'DEFU 2023',
  },
  diesel_large: {
    label: 'Diesel (SUV/Truck)',
    factor: 0.265,
    unit: 'tCO2e/litre',
    source: 'DEFU 2023',
  },
  hybrid: { label: 'Hybrid', factor: 0.105, unit: 'tCO2e/litre', source: 'DEFU 2023' },
  electric: { label: 'Electric', factor: 0.053, unit: 'tCO2e/kWh', source: 'EEA 2022' },
};

/** Flight emission factors (tCO2e per passenger-km). */
export const FLIGHT_FACTORS: Record<string, EmissionFactor> = {
  short_haul: {
    label: 'Short-haul (<3 hrs)',
    factor: 0.18,
    unit: 'tCO2e/pax-km',
    source: 'DEFU 2023',
  },
  medium_haul: {
    label: 'Medium-haul (3-6 hrs)',
    factor: 0.15,
    unit: 'tCO2e/pax-km',
    source: 'DEFU 2023',
  },
  long_haul: {
    label: 'Long-haul (>6 hrs)',
    factor: 0.11,
    unit: 'tCO2e/pax-km',
    source: 'DEFU 2023',
  },
};

/** Natural gas emission factor (tCO2e per kWh). */
export const NATURAL_GAS_FACTOR: EmissionFactor = {
  label: 'Natural gas',
  factor: 0.181,
  unit: 'tCO2e/kWh',
  source: 'DEFU 2023',
};

/** Heating oil emission factor (tCO2e per kWh). */
export const HEATING_OIL_FACTOR: EmissionFactor = {
  label: 'Heating oil',
  factor: 0.247,
  unit: 'tCO2e/kWh',
  source: 'DEFU 2023',
};

/** Propane emission factor (tCO2e per kWh). */
export const PROPANE_FACTOR: EmissionFactor = {
  label: 'Propane',
  factor: 0.214,
  unit: 'tCO2e/kWh',
  source: 'DEFU 2023',
};

/** Dietary emission factors (tCO2e per person per year). */
export const DIET_FACTORS: Record<string, EmissionFactor> = {
  meat_heavy: {
    label: 'High meat (>150g/day)',
    factor: 2.5,
    unit: 'tCO2e/person/yr',
    source: 'Pooine 2021',
  },
  meat_medium: {
    label: 'Medium meat (<annotation>50-150g/day)',
    factor: 2.0,
    unit: 'tCO2e/person/yr',
    source: 'Pooine 2021',
  },
  pescetarian: {
    label: 'Pescetarian',
    factor: 1.66,
    unit: 'tCO2e/person/yr',
    source: 'Pooine 2021',
  },
  vegan: { label: 'Vegan', factor: 1.38, unit: 'tCO2e/person/yr', source: 'Pooine 2021' },
};

/** Average annual emissions per person by region (tCO2e/person/yr). */
export const REGIONAL_PER_CAPITA_EMISSIONS: Record<string, number> = {
  global: 4.7,
  united_states: 14.4,
  european_union: 6.2,
  india: 1.9,
  brazil: 2.3,
  kenya: 0.4,
};

/** Default annual household electricity usage (kWh) if unknown. */
export const DEFAULT_HOUSEHOLD_KWH_PER_YEAR = 4000;

/** Default annual driving distance (km) if unknown. */
export const DEFAULT_DRIVING_KM_PER_YEAR = 15000;

/** Default fuel efficiency (litres per 100 km). */
export const DEFAULT_FUEL_EFFICIENCY_L_PER_100KM = 8.0;

/** Price of a single carbon credit in USD if unknown. */
export const DEFAULT_CREDIT_PRICE_USD = 15;
