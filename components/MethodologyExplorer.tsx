// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0
'use client';

import React, { useState, useMemo } from 'react';
import {
  CARBON_METHODOLOGIES,
  calculateMethodologyCredits,
  type CarbonMethodology,
  type MethodologyCategory,
  type CarbonStandard,
  type CalculationResult,
} from '@/lib/carbon/methodologyLibrary';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const CATEGORY_LABELS: Record<
  MethodologyCategory,
  { label: string; icon: string; description: string }
> = {
  reforestation: {
    label: 'Reforestation & Afforestation',
    icon: '🌲',
    description: 'Afforestation, reforestation, revegetation (ARR), and improved forest management',
  },
  soil_sequestration: {
    label: 'Soil Sequestration',
    icon: '🌱',
    description: 'Regenerative agriculture, improved soil organic carbon, and biochar application',
  },
  renewable_energy: {
    label: 'Renewable Energy',
    icon: '⚡',
    description: 'Solar PV, wind power, mini-hydro, and biomass power displacing fossil fuel grids',
  },
  methane_reduction: {
    label: 'Methane Reduction',
    icon: '🔥',
    description:
      'Livestock manure anaerobic digestion, landfill gas capture, and rice water management',
  },
  energy_efficiency: {
    label: 'Energy Efficiency',
    icon: '💡',
    description:
      'Clean cookstoves, LED lighting retrofits, industrial heat recovery, and fleet efficiency',
  },
};

const ALL_STANDARDS: CarbonStandard[] = [
  'Verra (VCS)',
  'Gold Standard',
  'UN CDM',
  'Climate Action Reserve',
  'Plan Vivo',
  'American Carbon Registry',
];

export function MethodologyExplorer() {
  const [selectedCategory, setSelectedCategory] = useState<MethodologyCategory | 'all'>('all');
  const [selectedStandard, setSelectedStandard] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCalculatorMethodology, setActiveCalculatorMethodology] =
    useState<CarbonMethodology | null>(null);

  // Calculator form state
  const [baselineInput, setBaselineInput] = useState<string>('1000');
  const [projectInput, setProjectInput] = useState<string>('200');
  const [leakageInput, setLeakageInput] = useState<string>('50');
  const [calcResult, setCalcResult] = useState<CalculationResult | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Filtered methodologies
  const filteredMethodologies = useMemo(() => {
    return CARBON_METHODOLOGIES.filter((m) => {
      if (selectedCategory !== 'all' && m.category !== selectedCategory) {
        return false;
      }
      if (selectedStandard !== 'all' && m.standard !== selectedStandard) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          m.id.toLowerCase().includes(q) ||
          m.code.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.summary.toLowerCase().includes(q) ||
          m.defaultEquation.toLowerCase().includes(q) ||
          m.coBenefits.some((b) => b.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [selectedCategory, selectedStandard, searchQuery]);

  // Handle calculation simulation
  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCalculatorMethodology) return;

    try {
      const b = parseFloat(baselineInput);
      const p = parseFloat(projectInput);
      const l = parseFloat(leakageInput) || 0;

      if (isNaN(b) || isNaN(p) || b < 0 || p < 0 || l < 0) {
        setCalcError('Please enter valid non-negative numbers for all emission fields.');
        setCalcResult(null);
        return;
      }

      const result = calculateMethodologyCredits(activeCalculatorMethodology.id, {
        baselineEmissionsTonnes: b,
        projectEmissionsTonnes: p,
        leakageTonnes: l,
      });

      setCalcResult(result);
      setCalcError(null);
    } catch (err: any) {
      setCalcError(err.message || 'Error executing methodology formula');
      setCalcResult(null);
    }
  };

  const openCalculator = (m: CarbonMethodology) => {
    setActiveCalculatorMethodology(m);
    setCalcError(null);
    try {
      const b = parseFloat(baselineInput) || 1000;
      const p = parseFloat(projectInput) || 200;
      const l = parseFloat(leakageInput) || 50;
      const result = calculateMethodologyCredits(m.id, {
        baselineEmissionsTonnes: b,
        projectEmissionsTonnes: p,
        leakageTonnes: l,
      });
      setCalcResult(result);
    } catch {
      setCalcResult(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header and Hero Overview */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-900/20 via-teal-900/10 to-slate-900/40 p-6 md:p-8 border border-emerald-500/20 shadow-sm">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold tracking-wide border border-emerald-500/30">
            <span>🌿 Verified Carbon Methodologies</span>
            <span>•</span>
            <span>{CARBON_METHODOLOGIES.length} Approved Protocols</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
            Database of Carbon Calculation Methodologies
          </h1>
          <p className="text-muted-foreground text-sm md:text-base leading-relaxed">
            Standardized quantification formulas and baseline protocols across{' '}
            <strong className="text-foreground">reforestation</strong>,{' '}
            <strong className="text-foreground">soil sequestration</strong>,{' '}
            <strong className="text-foreground">renewable energy</strong>,{' '}
            <strong className="text-foreground">methane reduction</strong>, and{' '}
            <strong className="text-foreground">energy efficiency</strong>. Aligned with Verra VCS,
            Gold Standard, UN CDM, CAR, and ACR standards.
          </p>
        </div>

        {/* Category Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
          {(Object.keys(CATEGORY_LABELS) as MethodologyCategory[]).map((cat) => {
            const count = CARBON_METHODOLOGIES.filter((m) => m.category === cat).length;
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(isSelected ? 'all' : cat)}
                className={`text-left p-3.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-500/15 shadow-md shadow-emerald-500/10'
                    : 'border-border/60 bg-background/60 hover:border-emerald-500/40 hover:bg-background'
                }`}
              >
                <div className="text-xl mb-1">{CATEGORY_LABELS[cat].icon}</div>
                <div className="text-xs font-semibold text-foreground truncate">
                  {CATEGORY_LABELS[cat].label}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{count} methodologies</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between bg-card p-4 rounded-xl border border-border/80">
        <div className="flex-1 max-w-md">
          <Input
            type="search"
            placeholder="Search by code, name, formula, or co-benefit..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-background"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Dropdown/Pills */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as any)}
            className="text-xs rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Sectors ({CARBON_METHODOLOGIES.length})</option>
            {(Object.keys(CATEGORY_LABELS) as MethodologyCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat].label}
              </option>
            ))}
          </select>

          {/* Standard Dropdown */}
          <select
            value={selectedStandard}
            onChange={(e) => setSelectedStandard(e.target.value)}
            className="text-xs rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Standards</option>
            {ALL_STANDARDS.map((std) => (
              <option key={std} value={std}>
                {std}
              </option>
            ))}
          </select>

          {(selectedCategory !== 'all' || selectedStandard !== 'all' || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedCategory('all');
                setSelectedStandard('all');
                setSearchQuery('');
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Reset Filters
            </Button>
          )}
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          Showing <strong className="text-foreground">{filteredMethodologies.length}</strong> of{' '}
          {CARBON_METHODOLOGIES.length} methodologies
        </span>
        {selectedCategory !== 'all' && (
          <span className="font-medium text-emerald-400">
            Sector: {CATEGORY_LABELS[selectedCategory].label}
          </span>
        )}
      </div>

      {/* Methodology Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredMethodologies.map((methodology) => {
          const categoryMeta = CATEGORY_LABELS[methodology.category];
          const isSelectedForCalc = activeCalculatorMethodology?.id === methodology.id;

          return (
            <div
              key={methodology.id}
              className={`flex flex-col justify-between rounded-xl border p-5 transition-all bg-card/60 backdrop-blur-sm ${
                isSelectedForCalc
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                  : 'border-border/70 hover:border-emerald-500/50 hover:shadow-md'
              }`}
            >
              <div className="space-y-3.5">
                {/* Badges and ID */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-sm font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/30">
                      {methodology.code}
                    </span>
                    <Badge variant="outline" className="text-xs font-normal">
                      {methodology.standard}
                    </Badge>
                    <Badge variant="secondary" className="text-xs font-normal">
                      {methodology.version}
                    </Badge>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full shrink-0">
                    {categoryMeta.icon} {methodology.category.replace('_', ' ')}
                  </span>
                </div>

                {/* Title and Summary */}
                <div>
                  <h3 className="text-base font-semibold text-foreground leading-snug">
                    {methodology.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    {methodology.summary}
                  </p>
                </div>

                {/* Formula Callout */}
                <div className="rounded-lg bg-muted/40 p-3 border border-border/50 space-y-1">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Core Quantification Equation
                  </div>
                  <code className="text-xs font-mono text-emerald-400 break-all block">
                    {methodology.defaultEquation}
                  </code>
                </div>

                {/* Models and Applicability */}
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div>
                    <strong className="text-foreground">Baseline Model:</strong>{' '}
                    {methodology.baselineModel}
                  </div>
                  <div>
                    <strong className="text-foreground">Project Model:</strong>{' '}
                    {methodology.projectModel}
                  </div>
                  {methodology.permanenceBufferPct > 0 && (
                    <div>
                      <strong className="text-foreground">Non-Permanence Risk Buffer:</strong>{' '}
                      <span className="text-amber-400 font-semibold">
                        {methodology.permanenceBufferPct}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Co-Benefits */}
                {methodology.coBenefits.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {methodology.coBenefits.map((benefit, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700"
                      >
                        {benefit}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Footer */}
              <div className="pt-4 mt-4 border-t border-border/60 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  Status:{' '}
                  <span className="text-emerald-400 font-medium capitalize">
                    {methodology.status}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant={isSelectedForCalc ? 'default' : 'outline'}
                  className="text-xs h-8"
                  onClick={() => openCalculator(methodology)}
                >
                  {isSelectedForCalc ? 'Calculating...' : 'Simulate Calculation 🧮'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Carbon Calculation Simulator Modal/Drawer */}
      {activeCalculatorMethodology && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-2xl bg-card border border-emerald-500/30 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                    {activeCalculatorMethodology.code}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {activeCalculatorMethodology.standard}
                  </Badge>
                </div>
                <h2 className="text-lg font-bold text-foreground mt-1">
                  Credit Calculation Simulator
                </h2>
                <p className="text-xs text-muted-foreground">{activeCalculatorMethodology.name}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveCalculatorMethodology(null)}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              >
                ✕
              </Button>
            </div>

            {/* Formula Reference */}
            <div className="rounded-lg bg-muted/40 p-3.5 border border-border/60 space-y-1.5 text-xs">
              <span className="font-semibold text-foreground">Active Equation:</span>
              <code className="block font-mono text-emerald-400 text-xs">
                {activeCalculatorMethodology.defaultEquation}
              </code>
              <p className="text-[11px] text-muted-foreground">
                Permanence Risk Buffer:{' '}
                <strong>{activeCalculatorMethodology.permanenceBufferPct}%</strong> | Measurement:{' '}
                {activeCalculatorMethodology.measurementFrequency}
              </p>
            </div>

            {/* Simulation Input Form */}
            <form onSubmit={handleCalculate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    Baseline Emissions (tCO₂e)
                  </label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={baselineInput}
                    onChange={(e) => setBaselineInput(e.target.value)}
                    className="text-xs"
                    placeholder="e.g. 1000"
                    required
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Business-as-usual emissions
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    Project Emissions (tCO₂e)
                  </label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={projectInput}
                    onChange={(e) => setProjectInput(e.target.value)}
                    className="text-xs"
                    placeholder="e.g. 200"
                    required
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Actual project footprint
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Leakage (tCO₂e)</label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={leakageInput}
                    onChange={(e) => setLeakageInput(e.target.value)}
                    className="text-xs"
                    placeholder="e.g. 50"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Off-boundary displaced emissions
                  </span>
                </div>
              </div>

              {calcError && (
                <div className="text-xs text-red-400 bg-red-900/20 border border-red-500/30 p-2.5 rounded-lg">
                  {calcError}
                </div>
              )}

              <Button type="submit" className="w-full text-xs">
                Compute Verified Carbon Credits
              </Button>
            </form>

            {/* Simulation Results Breakdown */}
            {calcResult && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                  <span className="text-xs font-semibold text-foreground">
                    Calculation Breakdown
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(calcResult.calculatedAt).toLocaleTimeString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg bg-background/60 p-2 border border-border/40">
                    <div className="text-[10px] text-muted-foreground">Gross Reduction</div>
                    <div className="text-sm font-bold text-foreground">
                      {calcResult.grossReductionTonnes.toLocaleString()} t
                    </div>
                  </div>

                  <div className="rounded-lg bg-background/60 p-2 border border-border/40">
                    <div className="text-[10px] text-muted-foreground">Leakage Deduction</div>
                    <div className="text-sm font-bold text-amber-400">
                      -{calcResult.leakageTonnes.toLocaleString()} t
                    </div>
                  </div>

                  <div className="rounded-lg bg-background/60 p-2 border border-border/40">
                    <div className="text-[10px] text-muted-foreground">
                      Buffer Pool ({calcResult.effectivePermanenceBufferPct}%)
                    </div>
                    <div className="text-sm font-bold text-amber-400">
                      -{calcResult.bufferDeductionTonnes.toLocaleString()} t
                    </div>
                  </div>

                  <div className="rounded-lg bg-emerald-500/20 p-2 border border-emerald-500/40">
                    <div className="text-[10px] text-emerald-300 font-semibold">
                      Net Credits Issued
                    </div>
                    <div className="text-base font-extrabold text-emerald-400">
                      {calcResult.netCreditsIssuedTonnes.toLocaleString()} tCO₂e
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
