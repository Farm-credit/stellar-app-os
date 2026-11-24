export interface CarbonOffsetInput {
  householdSize?: number;
  carKmPerYear?: number;
  electricityKwhPerYear?: number;
  [key: string]: unknown;
}

export interface CarbonOffsetEstimate {
  credits: number;
  totalEmissionsKg: number;
  emissionsKgByScope: {
    scope1: number;
    scope2: number;
    scope3: number;
  };
}

export function parseCarbonOffsetInput(input: unknown): CarbonOffsetInput {
  return input as CarbonOffsetInput;
}

export function getCarbonOffsetEstimate(_input: CarbonOffsetInput): CarbonOffsetEstimate {
  return {
    credits: 0,
    totalEmissionsKg: 0,
    emissionsKgByScope: { scope1: 0, scope2: 0, scope3: 0 },
  };
}
