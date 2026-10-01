'use client';

import React, { useMemo, useState } from 'react';
import {
  calculateCarbonProfile,
  type CarbonProfileInput,
  type CarbonProfileResult,
  type DietType,
  type FlightType,
  type VehicleType,
} from '@/lib/carbon/calculator';
import { ELECTRICITY_FACTORS } from '@/lib/carbon/emission-factors';
import { ResultsPanel } from './ResultsPanel';

interface FormState {
  householdSize: number;
  region: string;
  electricityKwh: number;
  naturalGasKwh: number;
  heatingOilKwh: number;
  propaneKwh: number;
  hasVehicle: boolean;
  vehicleCount: number;
  vehicleType: VehicleType;
  annualKm: number;
  fuelEfficiency: number;
  includeDiet: boolean;
  dietType: DietType;
  includeFlights: boolean;
  flightCount: number;
  flightType: FlightType;
  averageDistanceKM: number;
  creditPriceUSD: number;
}

const DEFAULT_STATE: FormState = {
  householdSize: 2,
  region: 'global_average',
  electricityKwh: 4000,
  naturalGasKwh: 0,
  heatingOilKwh: 0,
  propaneKwh: 0,
  hasVehicle: true,
  vehicleCount: 1,
  vehicleType: 'gasoline_mid',
  annualKm: 15000,
  fuelEfficiency: 8,
  includeDiet: true,
  dietType: 'meat_medium',
  includeFlights: false,
  flightCount: 2,
  flightType: 'medium_haul',
  averageDistanceKM: 1000,
  creditPriceUSD: 15,
};

const VEHICLE_OPTIONS: Array<{ value: VehicleType; label: string }> = [
  { value: 'gasoline_small', label: 'Gasoline – compact' },
  { value: 'gasoline_mid', label: 'Gasoline – midsize' },
  { value: 'gasoline_large', label: 'Gasoline – SUV/truck' },
  { value: 'diesel_small', label: 'Diesel – compact' },
  { value: 'diesel_mid', label: 'Diesel – midsize' },
  { value: 'diesel_large', label: 'Diesel – SUV/truck' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'electric', label: 'Electric' },
];

const DIET_OPTIONS: Array<{ value: DietType; label: string }> = [
  { value: 'meat_heavy', label: 'High meat' },
  { value: 'meat_medium', label: 'Medium meat' },
  { value: 'pescetarian', label: 'Pescetarian' },
  { value: 'vegan', label: 'Vegan' },
];

const FLIGHT_OPTIONS: Array<{ value: FlightType; label: string }> = [
  { value: 'short_haul', label: 'Short-haul (<3 hrs)' },
  { value: 'medium_haul', label: 'Medium-haul (3-6 hrs)' },
  { value: 'long_haul', label: 'Long-haul (>6 hrs)' },
];

function toNumber(value: string, fallback = 0): number {
  const parsed = Number.parseFloat(value);
  return Number.finite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function OffsetCalculator() {
  const [form, setForm] = useState<FormState>({ ...DEFAULT_STATE });
  const [result, setResult] = useState<CarbonProfileResult | null>(null);

  const regionOptions = useMemo(() => Object.entries(ELECTRICITY_FACTORS), []);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input: CarbonProfileInput = {
      household: {
        householdSize: form.householdSize,
        region: form.region,
        electricityKwh: form.electricityKwh,
        naturalGasKwh: form.naturalGasKwh,
        heatingOilKwh: form.heatingOilKwh,
        propaneKwh: form.propaneKwh,
      },
      vehicle: form.hasVehicle
        ? {
            vehicleCount: form.vehicleCount,
            vehicleType: form.vehicleType,
            annualKm: form.annualKm,
            fuelEfficiency: form.fuelEfficiency,
          }
        : undefined,
      diet: includeDiet ? { dietType: form.dietType } : undefined,
      flight: includeFlights
        ? {
            flightCount: form.flightCount,
            flightType: form.flightType,
            averageDistanceKM: form.averageDistanceKM,
          }
        : undefined,
      creditPriceUSD: form.creditPriceUSD,
    };
    setResult(calculateCarbonProfile(input));
  };

  if (result) {
    return <ResultsPanel result={result} onReset={() => setResult(null)} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Household</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Household size</span>
            <input
              type="number"
              min={1}
              value={form.householdSize}
              onChange={(e) => update('householdSize', Math.max(1, toNumber(e.target.value, 1)))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Region</span>
            <select
              value={form.region}
              onChange={(e) => update('region', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            >
              {regionOptions.map(([key, factor]) => (
                <option key={key} value={key}>
                  {factor.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Electricity (kWh/year)</span>
            <input
              type="number"
              min={0}
              value={form.electricityKwh}
              onChange={(e) => update('electricityKwh', toNumber(e.target.value))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Natural gas (kWh/year)</span>
            <input
              type="number"
              min={0}
              value={form.naturalGasKwh}
              onChange={(e) => update('naturalGasKwh', toNumber(e.target.value))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Heating oil (kWh/year)</span>
            <input
              type="number"
              min={0}
              value={form.heatingOilKwh}
              onChange={(e) => update('heatingOilKwh', toNumber(e.target.value))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Propane (kWh/year)</span>
            <input
              type="number"
              min={0}
              value={form.propaneKwh}
              onChange={(e) => update('propaneKwh', toNumber(e.target.value))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          </label>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Vehicle</h2>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.hasVehicle}
              onChange={(e) => update('hasVehicle', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            Include vehicle
          </label>
        </div>
        {form.hasVehicle && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Number of vehicles</span>
              <input
                type="number"
                min={1}
                value={form.vehicleCount}
                onChange={(e) => update('vehicleCount', Math.max(1, toNumber(e.target.value, 1)))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Vehicle type</span>
              <select
                value={form.vehicleType}
                onChange={(e) => update('vehicleType', e.target.value as VehicleType)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              >
                {VEHICLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Annual distance (km)</span>
              <input
                type="number"
                min={0}
                value={form.annualKm}
                onChange={(e) => update('annualKm', toNumber(e.target.value))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Fuel efficiency (L/100 km)</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={form.fuelEfficiency}
                onChange={(e) => update('fuelEfficiency', toNumber(e.target.value, 8))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
            </label>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Diet</h2>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.includeDiet}
              onChange={(e) => update('includeDiet', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            Include diet
          </label>
        </div>
        {form.includeDiet && (
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Diet type</span>
            <select
              value={form.dietType}
              onChange={(e) => update('dietType', e.target.value as DietType)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            >
              {DIET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Flights</h2>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.includeFlights}
              onChange={(e) => update('includeFlights', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            Include flights
          </label>
        </div>
        {form.includeFlights && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Flights per year</span>
              <input
                type="number"
                min={0}
                value={form.flightCount}
                onChange={(e) => update('flightCount', toNumber(e.target.value))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Flight type</span>
              <select
                value={form.flightType}
                onChange={(e) => update('flightType', e.target.value as FlightType)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              >
                {FLIGHT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Avg. distance (km)</span>
              <input
                type="number"
                min={0}
                value={form.averageDistanceKM}
                onChange={(e) => update('averageDistanceKM', toNumber(e.target.value, 1000))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
            </label>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Carbon credit price (USD)</span>
          <input
            type="number"
            min={1}
            value={form.creditPriceUSD}
            onChange={(e) => update('creditPriceUSD', toNumber(e.target.value, 15))}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
          />
        </label>
      </div>

      <button
        type="submit"
        className="w-full px-4 py-3 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
      >
        Calculate my carbon footprint
      </button>
    </form>
  );
}
