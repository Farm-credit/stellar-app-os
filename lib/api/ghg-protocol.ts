/**
 * GHG Protocol carbon accounting engine — Issue #1432
 *
 * Corporate greenhouse-gas inventory calculation following the GHG Protocol
 * Corporate Standard: direct emissions (Scope 1), purchased energy
 * (Scope 2 — dual-reported location-based and market-based per the Scope 2
 * Guidance), and value-chain emissions (Scope 3, selected categories).
 *
 * The calculation is a pure function over the request object, so it is fully
 * unit-testable without a database or network. Emission factors are published
 * defaults (EPA GHG Emission Factors Hub, DEFRA, IEA) kept in one table below
 * and surfaced by GET /api/v2/carbon-accounting so callers can see exactly
 * which numbers produced their result.
 *
 * Offsets (retired credits / platform tree sequestration) are reported
 * *separately* from gross emissions — the GHG Protocol requires reductions and
 * offsets to be distinguishable — but a net position is also provided for
 * convenience.
 */

import { z } from 'zod';

// ── Standard metadata ─────────────────────────────────────────────────────────

export const GHG_STANDARD = 'GHG Protocol Corporate Standard';
export const GHG_API_VERSION = '2.0';

/**
 * kg CO2e offset per planted tree over its lifetime. Mirrors
 * `CO2_KG_PER_TREE` in lib/stellar/tree-asset.ts (1 TREE = 48 kg CO2) without
 * importing that module — it pulls in @stellar/stellar-sdk, which would make
 * this engine non-hermetic. Keep the two values in sync.
 */
export const DEFAULT_TREE_CO2_KG = 48;

// ── Emission factors ──────────────────────────────────────────────────────────

/**
 * Scope 1 — stationary combustion. Quantities are in each fuel's natural
 * billing unit: therms for natural gas, gallons for liquid fuels.
 * Source: EPA GHG Emission Factors Hub (kg CO2e per unit burned).
 */
export const SCOPE1_STATIONARY_FACTORS = {
  'natural-gas': { unit: 'therm', kgCo2ePerUnit: 5.31 },
  gasoline: { unit: 'gallon', kgCo2ePerUnit: 8.887 },
  diesel: { unit: 'gallon', kgCo2ePerUnit: 10.21 },
} as const;

/**
 * Scope 1 — mobile combustion (fleet vehicles). Same fuels and factors as
 * stationary combustion; kept separate because the GHG Protocol requires the
 * two to be reported as distinct line items.
 */
export const SCOPE1_MOBILE_FACTORS = SCOPE1_STATIONARY_FACTORS;

/** Scope 1 — fugitive emissions: refrigerant global warming potential (GWP, AR4). */
export const REFRIGERANT_GWP = {
  'R-410A': 1924,
  'R-134A': 1430,
  'R-404A': 3922,
  'R-22': 1760,
} as const;

export type Refrigerant = keyof typeof REFRIGERANT_GWP;

/**
 * Scope 2 — grid electricity emission factors (kg CO2e / kWh,
 * location-based). Approximate published national/ regional averages.
 */
export const GRID_FACTORS = {
  'us-average': 0.417, // matches EMISSION_FACTORS.electricityKwh in lib/types/impact-calculator.ts
  'us-west': 0.26,
  eu: 0.23,
  uk: 0.207,
  global: 0.475,
} as const;

export type GridRegion = keyof typeof GRID_FACTORS;

/**
 * Scope 2 — purchased heat and steam: kg CO2e per kWh thermal, derived from
 * natural-gas boiler combustion (5.31 kg/therm ÷ 29.3 kWh/therm = 0.181).
 */
export const SCOPE2_HEAT_KG_PER_KWH = 0.181;
export const SCOPE2_STEAM_KG_PER_KWH = 0.181;

/**
 * Scope 3 — Category 4, upstream transportation & freight
 * (kg CO2e per tonne-kilometre). Source: DEFRA / UK BEIS conversion factors.
 */
export const FREIGHT_FACTORS = {
  truck: 0.104,
  rail: 0.03,
  air: 0.6,
  ship: 0.016,
} as const;

export type FreightMode = keyof typeof FREIGHT_FACTORS;

/**
 * Scope 3 — Category 5, waste disposal (kg CO2e per tonne of waste).
 * Approximate EPA WARM / DEFRA end-of-life factors.
 */
export const WASTE_FACTORS = {
  landfill: 580,
  incineration: 460,
  recycled: 50,
  composted: 40,
} as const;

export type WasteMethod = keyof typeof WASTE_FACTORS;

/**
 * Scope 3 — Category 6, business travel. Flight factors are per return trip
 * and match EMISSION_FACTORS.shortFlight / longFlight in
 * lib/types/impact-calculator.ts so the corporate and personal calculators
 * agree on the same trip. Rail/car are per kilometre.
 */
export const BUSINESS_TRAVEL_FACTORS = {
  shortHaulFlightKgPerTrip: 255, // short-haul return trip
  longHaulFlightKgPerTrip: 1650, // long-haul return trip
  railKgPerKm: 0.035, // per passenger-km (DEFRA)
  carKgPerKm: 0.171, // per vehicle-km, average occupancy (DEFRA)
} as const;

/**
 * Scope 3 — Category 7, employee commuting (kg CO2e per kilometre).
 * Car is per vehicle-km; bus/rail are per passenger-km.
 */
export const COMMUTING_FACTORS = {
  car: 0.171,
  bus: 0.102,
  rail: 0.035,
  walk: 0,
  bike: 0,
} as const;

export type CommutingMode = keyof typeof COMMUTING_FACTORS;

// ── Request schema ────────────────────────────────────────────────────────────

const nonNegative = z.number().finite('must be a finite number').min(0, 'must be >= 0');

const fuelLineSchema = z.object({
  fuel: z.enum(['natural-gas', 'gasoline', 'diesel']),
  /** therms for natural gas, gallons for gasoline/diesel */
  quantity: nonNegative,
});

const refrigerantLineSchema = z.object({
  refrigerant: z.enum(['R-410A', 'R-134A', 'R-404A', 'R-22']),
  /** charge weight in kg */
  quantityKg: nonNegative,
});

const freightLineSchema = z.object({
  mode: z.enum(['truck', 'rail', 'air', 'ship']),
  tonnes: nonNegative,
  distanceKm: nonNegative,
});

const wasteLineSchema = z.object({
  method: z.enum(['landfill', 'incineration', 'recycled', 'composted']),
  tonnes: nonNegative,
});

const commutingLineSchema = z.object({
  mode: z.enum(['car', 'bus', 'rail', 'walk', 'bike']),
  distanceKm: nonNegative,
});

const isoDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'must be an ISO 8601 date string');

const ghgInventoryRequestSchema = z
  .object({
    /** Reporting period; defaults to the current calendar year. */
    reportingPeriod: z.object({ from: isoDateSchema, to: isoDateSchema }).optional(),
    organization: z
      .object({
        name: z.string().min(1).max(200).optional(),
        employees: z.number().int().min(1).optional(),
      })
      .optional(),
    scope1: z
      .object({
        stationary: z.array(fuelLineSchema).optional(),
        mobile: z.array(fuelLineSchema).optional(),
        fugitive: z.array(refrigerantLineSchema).optional(),
      })
      .optional(),
    scope2: z
      .object({
        electricityKwh: nonNegative.optional(),
        heatKwh: nonNegative.optional(),
        steamKwh: nonNegative.optional(),
        gridRegion: z.enum(['us-average', 'us-west', 'eu', 'uk', 'global']).optional(),
        /** Share of electricity covered by renewable contracts (RECs/PPAs). */
        renewablePercentage: z.number().min(0).max(100).optional(),
      })
      .optional(),
    scope3: z
      .object({
        freight: z.array(freightLineSchema).optional(),
        waste: z.array(wasteLineSchema).optional(),
        businessTravel: z
          .object({
            shortHaulFlights: z.number().int().min(0).optional(),
            longHaulFlights: z.number().int().min(0).optional(),
            railKm: nonNegative.optional(),
            carKm: nonNegative.optional(),
          })
          .optional(),
        commuting: z.array(commutingLineSchema).optional(),
      })
      .optional(),
    offsets: z
      .object({
        creditsRetiredTonnes: nonNegative.optional(),
        treesPlanted: z.number().int().min(0).optional(),
        /** Override the default lifetime sequestration per tree (kg CO2e). */
        co2KgPerTree: nonNegative.optional(),
      })
      .optional(),
  })
  .refine(
    (data) => Boolean(data.scope1 || data.scope2 || data.scope3 || data.offsets),
    'at least one of scope1, scope2, scope3, offsets is required'
  );

export type GhgInventoryRequest = z.infer<typeof ghgInventoryRequestSchema>;

export type GhgInventoryParseResult =
  { ok: true; data: GhgInventoryRequest } | { ok: false; errors: string[] };

/**
 * Validates an already-parsed request object (POST bodies, internal callers).
 * Returns a flat list of field errors for the API's 400 response body.
 */
export function parseGhgInventoryRequest(input: unknown): GhgInventoryParseResult {
  const result = ghgInventoryRequestSchema.safeParse(input);

  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    };
  }

  const period = result.data.reportingPeriod;
  if (period && Date.parse(period.from) > Date.parse(period.to)) {
    return { ok: false, errors: ['reportingPeriod.to: must be on or after reportingPeriod.from'] };
  }

  return { ok: true, data: result.data };
}

/**
 * Builds and validates a request from `GET` query parameters.
 * Scope 1/2/3 activity data is too structured for a query string, so GET
 * supports the simple scalar subset; POST accepts the full shape.
 */
export function parseGhgInventoryQuery(searchParams: URLSearchParams): GhgInventoryParseResult {
  const raw: Record<string, unknown> = {};

  const scope1Therms = searchParams.get('scope1.naturalGasTherms');
  if (scope1Therms !== null) {
    raw.scope1 = {
      stationary: [{ fuel: 'natural-gas', quantity: Number(scope1Therms) }],
    };
  }

  const electricityKwh = searchParams.get('scope2.electricityKwh');
  const gridRegion = searchParams.get('scope2.gridRegion');
  const renewablePercentage = searchParams.get('scope2.renewablePercentage');
  if (electricityKwh !== null || gridRegion !== null || renewablePercentage !== null) {
    raw.scope2 = {
      ...(electricityKwh !== null ? { electricityKwh: Number(electricityKwh) } : {}),
      ...(gridRegion !== null ? { gridRegion } : {}),
      ...(renewablePercentage !== null ? { renewablePercentage: Number(renewablePercentage) } : {}),
    };
  }

  const creditsRetiredTonnes = searchParams.get('offsets.creditsRetiredTonnes');
  const treesPlanted = searchParams.get('offsets.treesPlanted');
  if (creditsRetiredTonnes !== null || treesPlanted !== null) {
    raw.offsets = {
      ...(creditsRetiredTonnes !== null
        ? { creditsRetiredTonnes: Number(creditsRetiredTonnes) }
        : {}),
      ...(treesPlanted !== null ? { treesPlanted: Number(treesPlanted) } : {}),
    };
  }

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (from !== null || to !== null) {
    raw.reportingPeriod = { ...(from !== null ? { from } : {}), ...(to !== null ? { to } : {}) };
  }

  return parseGhgInventoryRequest(raw);
}

// ── Report shape ──────────────────────────────────────────────────────────────

export interface EmissionsLine {
  /** Human-readable source label, e.g. 'natural-gas', 'R-410A', 'truck'. */
  source: string;
  emissionsKg: number;
}

export interface Scope1Result {
  stationary: EmissionsLine[];
  mobile: EmissionsLine[];
  fugitive: EmissionsLine[];
  totalKg: number;
  totalTonnes: number;
}

export interface Scope2Result {
  electricityKg: number;
  heatKg: number;
  steamKg: number;
  gridRegion: GridRegion;
  renewablePercentage: number;
  /** Grid-factor method — what actually entered the atmosphere. */
  locationBasedKg: number;
  /** Contractual method — renewable-covered electricity counted as zero. */
  marketBasedKg: number;
  locationBasedTonnes: number;
  marketBasedTonnes: number;
  totalKg: number;
  totalTonnes: number;
}

export interface Scope3CategoryResult {
  /** GHG Protocol Scope 3 category number. */
  category: 4 | 5 | 6 | 7;
  name: string;
  emissionsKg: number;
  emissionsTonnes: number;
}

export interface Scope3Result {
  categories: Scope3CategoryResult[];
  totalKg: number;
  totalTonnes: number;
}

export interface GhgInventoryReport {
  standard: typeof GHG_STANDARD;
  version: typeof GHG_API_VERSION;
  generatedAt: string;
  period: { from: string; to: string };
  organization?: { name?: string; employees?: number };
  scope1: Scope1Result;
  scope2: Scope2Result;
  scope3: Scope3Result;
  /** Scope 1 + Scope 2 (location-based) + Scope 3 — the full gross inventory. */
  grossEmissions: { kg: number; tonnes: number };
  /** Reported separately from the inventory, per the GHG Protocol. */
  offsets: {
    creditsRetiredTonnes: number;
    treeSequestrationTonnes: number;
    totalTonnes: number;
  };
  /** gross − offsets. Negative means a net-negative position. */
  netEmissions: { kg: number; tonnes: number };
  /** Present when organization.employees was supplied. */
  intensity?: { perEmployeeTonnes: number };
}

// ── Calculation ───────────────────────────────────────────────────────────────

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function defaultPeriod(): { from: string; to: string } {
  const year = new Date().getUTCFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function sum(lines: EmissionsLine[]): number {
  return lines.reduce((total, line) => total + line.emissionsKg, 0);
}

function toTonnes(kg: number): number {
  return round(kg / 1000);
}

function calculateScope1(request: GhgInventoryRequest): Scope1Result {
  const stationary: EmissionsLine[] = (request.scope1?.stationary ?? []).map((line) => ({
    source: line.fuel,
    emissionsKg: round(SCOPE1_STATIONARY_FACTORS[line.fuel].kgCo2ePerUnit * line.quantity),
  }));

  const mobile: EmissionsLine[] = (request.scope1?.mobile ?? []).map((line) => ({
    source: line.fuel,
    emissionsKg: round(SCOPE1_MOBILE_FACTORS[line.fuel].kgCo2ePerUnit * line.quantity),
  }));

  const fugitive: EmissionsLine[] = (request.scope1?.fugitive ?? []).map((line) => ({
    source: line.refrigerant,
    emissionsKg: round(REFRIGERANT_GWP[line.refrigerant] * line.quantityKg),
  }));

  const totalKg = round(sum(stationary) + sum(mobile) + sum(fugitive));
  return { stationary, mobile, fugitive, totalKg, totalTonnes: toTonnes(totalKg) };
}

function calculateScope2(request: GhgInventoryRequest): Scope2Result {
  const input = request.scope2;
  const gridRegion: GridRegion = input?.gridRegion ?? 'us-average';
  const renewablePercentage = input?.renewablePercentage ?? 0;
  const gridFactor = GRID_FACTORS[gridRegion];

  const electricityKwh = input?.electricityKwh ?? 0;
  const heatKwh = input?.heatKwh ?? 0;
  const steamKwh = input?.steamKwh ?? 0;

  const electricityKg = round(electricityKwh * gridFactor);
  const heatKg = round(heatKwh * SCOPE2_HEAT_KG_PER_KWH);
  const steamKg = round(steamKwh * SCOPE2_STEAM_KG_PER_KWH);

  // Dual reporting (GHG Protocol Scope 2 Guidance): location-based counts all
  // grid electricity at the grid average; market-based credits the share
  // covered by renewable contracts (RECs, PPAs, GOs) at zero.
  const locationBasedKg = round(electricityKg + heatKg + steamKg);
  const marketBasedKg = round(electricityKg * (1 - renewablePercentage / 100) + heatKg + steamKg);

  return {
    electricityKg,
    heatKg,
    steamKg,
    gridRegion,
    renewablePercentage,
    locationBasedKg,
    marketBasedKg,
    locationBasedTonnes: toTonnes(locationBasedKg),
    marketBasedTonnes: toTonnes(marketBasedKg),
    totalKg: locationBasedKg,
    totalTonnes: toTonnes(locationBasedKg),
  };
}

function calculateScope3(request: GhgInventoryRequest): Scope3Result {
  const input = request.scope3;
  const categories: Scope3CategoryResult[] = [];

  const freight = input?.freight ?? [];
  if (freight.length > 0) {
    const emissionsKg = round(
      freight.reduce(
        (total, line) => total + FREIGHT_FACTORS[line.mode] * line.tonnes * line.distanceKm,
        0
      )
    );
    categories.push({
      category: 4,
      name: 'Upstream transportation and distribution',
      emissionsKg,
      emissionsTonnes: toTonnes(emissionsKg),
    });
  }

  const waste = input?.waste ?? [];
  if (waste.length > 0) {
    const emissionsKg = round(
      waste.reduce((total, line) => total + WASTE_FACTORS[line.method] * line.tonnes, 0)
    );
    categories.push({
      category: 5,
      name: 'Waste generated in operations',
      emissionsKg,
      emissionsTonnes: toTonnes(emissionsKg),
    });
  }

  const travel = input?.businessTravel;
  if (travel) {
    const emissionsKg = round(
      (travel.shortHaulFlights ?? 0) * BUSINESS_TRAVEL_FACTORS.shortHaulFlightKgPerTrip +
        (travel.longHaulFlights ?? 0) * BUSINESS_TRAVEL_FACTORS.longHaulFlightKgPerTrip +
        (travel.railKm ?? 0) * BUSINESS_TRAVEL_FACTORS.railKgPerKm +
        (travel.carKm ?? 0) * BUSINESS_TRAVEL_FACTORS.carKgPerKm
    );
    const hasTravelInput =
      (travel.shortHaulFlights ?? 0) > 0 ||
      (travel.longHaulFlights ?? 0) > 0 ||
      (travel.railKm ?? 0) > 0 ||
      (travel.carKm ?? 0) > 0;
    if (hasTravelInput) {
      categories.push({
        category: 6,
        name: 'Business travel',
        emissionsKg,
        emissionsTonnes: toTonnes(emissionsKg),
      });
    }
  }

  const commuting = input?.commuting ?? [];
  if (commuting.length > 0) {
    const emissionsKg = round(
      commuting.reduce((total, line) => total + COMMUTING_FACTORS[line.mode] * line.distanceKm, 0)
    );
    categories.push({
      category: 7,
      name: 'Employee commuting',
      emissionsKg,
      emissionsTonnes: toTonnes(emissionsKg),
    });
  }

  const totalKg = round(categories.reduce((total, category) => total + category.emissionsKg, 0));
  return { categories, totalKg, totalTonnes: toTonnes(totalKg) };
}

/**
 * Computes a full GHG Protocol inventory report from a validated request.
 * Pure: no I/O, deterministic for the same input (apart from generatedAt).
 */
export function calculateGhgInventory(request: GhgInventoryRequest): GhgInventoryReport {
  const scope1 = calculateScope1(request);
  const scope2 = calculateScope2(request);
  const scope3 = calculateScope3(request);

  // Gross inventory uses the location-based Scope 2 figure (the physical
  // grid accounting); the market-based figure is reported alongside it.
  const grossKg = round(scope1.totalKg + scope2.locationBasedKg + scope3.totalKg);

  const creditsRetiredTonnes = request.offsets?.creditsRetiredTonnes ?? 0;
  const treesPlanted = request.offsets?.treesPlanted ?? 0;
  const co2KgPerTree = request.offsets?.co2KgPerTree ?? DEFAULT_TREE_CO2_KG;
  const treeSequestrationTonnes = round((treesPlanted * co2KgPerTree) / 1000);
  const offsetTonnes = round(creditsRetiredTonnes + treeSequestrationTonnes);

  const netKg = round(grossKg - offsetTonnes * 1000);

  const report: GhgInventoryReport = {
    standard: GHG_STANDARD,
    version: GHG_API_VERSION,
    generatedAt: new Date().toISOString(),
    period: request.reportingPeriod ?? defaultPeriod(),
    scope1,
    scope2,
    scope3,
    grossEmissions: { kg: grossKg, tonnes: toTonnes(grossKg) },
    offsets: {
      creditsRetiredTonnes: round(creditsRetiredTonnes),
      treeSequestrationTonnes,
      totalTonnes: offsetTonnes,
    },
    netEmissions: { kg: netKg, tonnes: toTonnes(netKg) },
  };

  if (request.organization) {
    report.organization = request.organization;
    const employees = request.organization.employees;
    if (employees) {
      report.intensity = { perEmployeeTonnes: round(toTonnes(grossKg) / employees, 4) };
    }
  }

  return report;
}

// ── Factor catalogue (GET) ────────────────────────────────────────────────────

export interface GhgFactorCatalogue {
  standard: typeof GHG_STANDARD;
  version: typeof GHG_API_VERSION;
  scopes: Record<string, string>;
  factors: {
    scope1: {
      stationary: typeof SCOPE1_STATIONARY_FACTORS;
      mobile: typeof SCOPE1_MOBILE_FACTORS;
      refrigerants: typeof REFRIGERANT_GWP;
    };
    scope2: {
      gridRegions: typeof GRID_FACTORS;
      heatKgPerKwh: number;
      steamKgPerKwh: number;
      marketBasedMethod: string;
    };
    scope3: {
      freightKgPerTonneKm: typeof FREIGHT_FACTORS;
      wasteKgPerTonne: typeof WASTE_FACTORS;
      businessTravel: typeof BUSINESS_TRAVEL_FACTORS;
      commutingKgPerKm: typeof COMMUTING_FACTORS;
    };
  };
}

/**
 * The emission-factor catalogue returned by GET /api/v2/carbon-accounting —
 * everything a caller needs to reproduce the calculations by hand.
 */
export function getGhgFactorCatalogue(): GhgFactorCatalogue {
  return {
    standard: GHG_STANDARD,
    version: GHG_API_VERSION,
    scopes: {
      '1': 'Direct emissions from owned or controlled sources (combustion, fleet, fugitives).',
      '2': 'Indirect emissions from purchased energy; reported location-based and market-based.',
      '3': 'Indirect value-chain emissions; GHG Protocol categories 4, 5, 6 and 7 are supported.',
    },
    factors: {
      scope1: {
        stationary: SCOPE1_STATIONARY_FACTORS,
        mobile: SCOPE1_MOBILE_FACTORS,
        refrigerants: REFRIGERANT_GWP,
      },
      scope2: {
        gridRegions: GRID_FACTORS,
        heatKgPerKwh: SCOPE2_HEAT_KG_PER_KWH,
        steamKgPerKwh: SCOPE2_STEAM_KG_PER_KWH,
        marketBasedMethod:
          'Renewable-covered share of electricity is counted at zero (RECs/PPAs); the remainder uses the grid average.',
      },
      scope3: {
        freightKgPerTonneKm: FREIGHT_FACTORS,
        wasteKgPerTonne: WASTE_FACTORS,
        businessTravel: BUSINESS_TRAVEL_FACTORS,
        commutingKgPerKm: COMMUTING_FACTORS,
      },
    },
  };
}
