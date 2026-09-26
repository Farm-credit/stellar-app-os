import { z } from 'zod';

/** Published default factors in kg CO2e per input unit. */
export const CARBON_IMPACT_FACTORS = {
  electricityKwh: 0.417,
  naturalGasTherm: 5.31,
  gasolineLiter: 2.31,
  dieselLiter: 2.68,
  electricVehicleKwh: 0.417,
} as const;

const nonNegative = z.number().finite().min(0);

export const carbonImpactRequestSchema = z.object({
  employees: z.number().int().positive(),
  energy: z.object({
    electricityKwh: nonNegative.default(0),
    naturalGasTherms: nonNegative.default(0),
    renewablePercentage: z.number().finite().min(0).max(100).default(0),
  }),
  vehicles: z.object({
    gasolineLiters: nonNegative.default(0),
    dieselLiters: nonNegative.default(0),
    electricKwh: nonNegative.default(0),
  }),
});

export type CarbonImpactRequest = z.infer<typeof carbonImpactRequestSchema>;

export type CarbonImpactResult = {
  employees: number;
  emissions: {
    energyKg: number;
    vehicleKg: number;
    totalKg: number;
    totalTonnes: number;
    perEmployeeKg: number;
    perEmployeeTonnes: number;
  };
  recommendations: {
    creditsNeeded: number;
    creditsUnit: 'metric_tonne_co2e';
    renewableEnergySavingsKg: number;
    notes: string[];
  };
  factors: typeof CARBON_IMPACT_FACTORS;
};

export function calculateCarbonImpact(input: CarbonImpactRequest): CarbonImpactResult {
  const renewableShare = input.energy.renewablePercentage / 100;
  const electricityKg =
    input.energy.electricityKwh * CARBON_IMPACT_FACTORS.electricityKwh * (1 - renewableShare);
  const naturalGasKg = input.energy.naturalGasTherms * CARBON_IMPACT_FACTORS.naturalGasTherm;
  const gasolineKg = input.vehicles.gasolineLiters * CARBON_IMPACT_FACTORS.gasolineLiter;
  const dieselKg = input.vehicles.dieselLiters * CARBON_IMPACT_FACTORS.dieselLiter;
  const electricVehicleKg = input.vehicles.electricKwh * CARBON_IMPACT_FACTORS.electricVehicleKwh;
  const energyKg = electricityKg + naturalGasKg;
  const vehicleKg = gasolineKg + dieselKg + electricVehicleKg;
  const totalKg = energyKg + vehicleKg;
  const totalTonnes = totalKg / 1000;

  return {
    employees: input.employees,
    emissions: {
      energyKg: round(energyKg),
      vehicleKg: round(vehicleKg),
      totalKg: round(totalKg),
      totalTonnes: round(totalTonnes),
      perEmployeeKg: round(totalKg / input.employees),
      perEmployeeTonnes: round(totalTonnes / input.employees),
    },
    recommendations: {
      creditsNeeded: Math.ceil(totalTonnes),
      creditsUnit: 'metric_tonne_co2e',
      renewableEnergySavingsKg: round(
        input.energy.electricityKwh * CARBON_IMPACT_FACTORS.electricityKwh * renewableShare
      ),
      notes: [
        'Use verified credits and report retirement separately from emissions reduction.',
        'Replace the default factors with region-specific factors when available.',
      ],
    },
    factors: CARBON_IMPACT_FACTORS,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
